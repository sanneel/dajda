// Applies the real migration SQL to an in-process Postgres (PGlite) and then
// probes the integrity constraints to prove they actually bite.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'F:/dajda/prisma/migrations';
const db = new PGlite();

// Directories only: `migration_lock.toml` sits alongside them and is not one.
const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();
for (const dir of dirs) {
  const sql = readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
  try {
    await db.exec(sql);
    console.log(`APPLIED  ${dir}`);
  } catch (e) {
    console.error(`FAILED   ${dir}\n  ${e.message}`);
    process.exit(1);
  }
}

const { rows: tables } = await db.query(
  `select count(*)::int as n from information_schema.tables where table_schema='public'`,
);
const { rows: idx } = await db.query(
  `select count(*)::int as n from pg_indexes where schemaname='public'`,
);
const { rows: checks } = await db.query(
  `select count(*)::int as n from pg_constraint where contype='c'
   and connamespace='public'::regnamespace`,
);
console.log(`\ntables=${tables[0].n} indexes=${idx[0].n} check_constraints=${checks[0].n}`);

// ---- probe the constraints that matter -----------------------------------
async function expectReject(label, fn) {
  try {
    await fn();
    console.error(`NOT ENFORCED: ${label}`);
    process.exitCode = 1;
  } catch {
    console.log(`enforced: ${label}`);
  }
}

await db.exec(`
  INSERT INTO "Sport"(id,code,slug,"nameKa","updatedAt") VALUES
    ('11111111-1111-1111-1111-111111111111','FOOTBALL','football','ფეხბურთი',now());
  INSERT INTO "Provider"(id,code,name,"updatedAt") VALUES
    ('22222222-2222-2222-2222-222222222222','betsson','Betsson',now());
  INSERT INTO "CanonicalMarket"(id,code,"nameKa","settlementRule","updatedAt") VALUES
    ('33333333-3333-3333-3333-333333333333','GOAL','გოლი','BINARY_OCCURRENCE',now());
`);

const insertMapping = (id, active, version = 1) => db.exec(`
  INSERT INTO "ProviderMarketMapping"
    (id,"providerId","rawLabel","normalizedLabel","sportId","canonicalMarketId",
     "teamScope","period","isActive","version","updatedAt")
  VALUES ('${id}','22222222-2222-2222-2222-222222222222','x','x',
     '11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
     'MATCH','FULL_MATCH',${active},${version},now());
`);

await insertMapping('44444444-4444-4444-4444-444444444444', true);
await expectReject('one ACTIVE mapping per (provider,sport,label,period)', () =>
  insertMapping('55555555-5555-5555-5555-555555555555', true, 2),
);
// A superseded (inactive) row for the same key must still be allowed, so that
// the previous interpretation stays reconstructible. Version must advance.
await insertMapping('66666666-6666-6666-6666-666666666666', false, 2);
console.log('allowed: inactive duplicate retained as history');

await db.exec(`
  INSERT INTO "League"(id,"sportId",slug,"nameKa","updatedAt") VALUES
    ('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111','erovnuli-liga','ეროვნული ლიგა',now());
  INSERT INTO "Match"(id,"sportId","leagueId","homeTeam","awayTeam","startsAt","updatedAt") VALUES
    ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777777','დინამო','საბურთალო',now(),now());
  INSERT INTO "User"(id,email,password,name,"updatedAt") VALUES
    ('99999999-9999-9999-9999-999999999999','a@b.ge','x','ა',now());
  INSERT INTO "AnalystProfile"(id,"userId","displayName",slug,"updatedAt") VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','99999999-9999-9999-9999-999999999999','ანა','ana',now());
`);

const insertPrediction = (id, extra) => db.exec(`
  INSERT INTO "Prediction"
    (id,"authorId","matchId","sportId","leagueId","teamScope","period","selection",
     "oddsMilli","titleKa","analysisKa","matchStartsAt","updatedAt",${extra.cols})
  VALUES ('${id}','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','88888888-8888-8888-8888-888888888888',
     '11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777777',
     'MATCH','FULL_MATCH','OVER',${extra.odds ?? 1850},'t','a',now(),now(),${extra.vals});
`);

await expectReject('published prediction requires RESOLVED + canonical market', () =>
  insertPrediction('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', {
    cols: '"publishedAt","resolutionStatus"',
    vals: "now(),'NEEDS_REVIEW'",
  }),
);
await expectReject('odds must exceed 1.000', () =>
  insertPrediction('cccccccc-cccc-cccc-cccc-cccccccccccc', {
    cols: '"resolutionStatus"', vals: "'RESOLVED'", odds: 900,
  }),
);
await expectReject('stake must be positive', () =>
  insertPrediction('dddddddd-dddd-dddd-dddd-dddddddddddd', {
    cols: '"resolutionStatus","stakeUnitsCenti"', vals: "'RESOLVED',0",
  }),
);
await expectReject('report target must match its declared type', () =>
  db.exec(`INSERT INTO "Report"(id,"targetType",reason,"updatedAt")
           VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','ANALYST','SPAM',now());`),
);

console.log('\nmigration verification complete');
await db.close();
