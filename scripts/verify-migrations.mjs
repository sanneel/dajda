// Applies the real migration SQL to an in-process Postgres (PGlite) and then
// probes the integrity constraints to prove they actually bite.
//
// The point is not that the SQL parses. It is that the guarantees the
// application code leans on - a webhook may be redelivered, a bet settles
// once, a ticket is bought once - are enforced by the database and not only
// by the TypeScript that happens to sit in front of it today.
//
// Every probe states the SQLSTATE it expects, so a probe cannot pass because
// the test SQL had a typo. A rejection for the wrong reason is a failure.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolved from this file, not hard-coded: the script has to run on somebody
// else's machine and in CI, where F:\dajda does not exist.
const MIGRATIONS = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  'prisma',
  'migrations',
);

/** SQLSTATE classes, so a probe can name the failure it wants. */
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

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
const { rows: checkRows } = await db.query(
  `select conname from pg_constraint where contype='c'
   and connamespace='public'::regnamespace order by conname`,
);
console.log(
  `\ntables=${tables[0].n} indexes=${idx[0].n} check_constraints=${checkRows.length}`,
);

// ---- probe the constraints that matter -----------------------------------

/**
 * Setup SQL. A fixture that fails is not a finding, it is a broken test, so
 * it stops the run loudly rather than making every later probe "pass" by
 * failing for the wrong reason.
 */
async function must(label, sql) {
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`FIXTURE FAILED: ${label}\n  ${e.message}`);
    process.exit(1);
  }
}

/**
 * The statement must be refused, and refused with `code`. Without the code an
 * `expectReject` passes when the probe itself is wrong - a renamed column, a
 * missing table - which is exactly how this file rotted the first time.
 */
async function expectReject(label, code, sql) {
  try {
    await db.exec(sql);
    console.error(`NOT ENFORCED: ${label}`);
    process.exitCode = 1;
  } catch (e) {
    if (e.code === code) {
      console.log(`enforced: ${label}`);
    } else {
      console.error(
        `WRONG FAILURE: ${label}\n  wanted ${code}, got ${e.code ?? '(none)'}: ${e.message}`,
      );
      process.exitCode = 1;
    }
  }
}

/** The statement must be accepted: the constraint has to permit the legal case. */
async function expectAccept(label, sql) {
  try {
    await db.exec(sql);
    console.log(`allowed:  ${label}`);
  } catch (e) {
    console.error(`WRONGLY REFUSED: ${label}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

const SPORT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const ANALYST = '33333333-3333-3333-3333-333333333333';
const BET = '44444444-4444-4444-4444-444444444444';
const PLAN = '55555555-5555-5555-5555-555555555555';
const PAYMENT = '66666666-6666-6666-6666-666666666666';

await must(
  'base rows',
  `
  INSERT INTO "Sport"(id,code,slug,"nameKa","updatedAt") VALUES
    ('${SPORT}','FOOTBALL','football','ფეხბურთი',now());
  INSERT INTO "User"(id,email,password,name,"updatedAt") VALUES
    ('${USER}','a@b.ge','x','ანა',now());
  INSERT INTO "AnalystProfile"(id,"userId","displayName",slug,"updatedAt") VALUES
    ('${ANALYST}','${USER}','ანა','ana',now());
  INSERT INTO "Prediction"
    (id,"authorId","postedById","sportId","oddsMilli","titleKa","screenshotPath","updatedAt")
  VALUES ('${BET}','${ANALYST}','${USER}','${SPORT}',1850,'ბილეთი','/uploads/x.webp',now());
  INSERT INTO "SubscriptionPlan"(id,tier,"nameKa","descriptionKa","priceMinor","updatedAt")
  VALUES ('${PLAN}','PREMIUM','გეგმა','აღწერა',3000,now());
  INSERT INTO "Payment"(id,"userId","providerCode","providerOrderId","amountMinor","updatedAt")
  VALUES ('${PAYMENT}','${USER}','mock','order-1',3000,now());
`,
);

const bet = (id, cols, vals) => `
  INSERT INTO "Prediction"
    (id,"authorId","postedById","sportId","oddsMilli","titleKa","screenshotPath","updatedAt"${cols})
  VALUES ('${id}','${ANALYST}','${USER}','${SPORT}',1850,'ბილეთი','/uploads/x.webp',now()${vals});`;

// --- money never moves by the wrong amount --------------------------------

await expectReject(
  'Payment_amount_positive: a payment of nothing',
  CHECK_VIOLATION,
  `INSERT INTO "Payment"(id,"userId","providerCode","providerOrderId","amountMinor","updatedAt")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000001','${USER}','mock','order-zero',0,now());`,
);

await expectReject(
  'AnalystPayout_amount_positive: a withdrawal of a negative sum',
  CHECK_VIOLATION,
  `INSERT INTO "AnalystPayout"
     (id,"analystProfileId","userId","amountMinor","maskedAccount","providerOrderId",
      "periodStart","periodEnd","publicationsInPeriod","activityCheckPassed")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000002','${ANALYST}','${USER}',-1,'4444**1111',
      'payout-1',now(),now(),0,true);`,
);

await expectReject(
  'BalanceTransaction_amount_nonzero: a ledger row that moves nothing',
  CHECK_VIOLATION,
  `INSERT INTO "BalanceTransaction"(id,"userId",kind,"amountMinor","balanceAfterMinor")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000003','${USER}','ADJUSTMENT',0,0);`,
);

/*
 * The ledger's idempotency. `creditAnalystEarning` catches the unique
 * violation and treats it as "this payment has already earned once", so a
 * redelivered webhook must collide HERE or the analyst is paid twice.
 */
await must(
  'first earning for a payment',
  `INSERT INTO "BalanceTransaction"(id,"userId",kind,account,"amountMinor","balanceAfterMinor","paymentId")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000004','${USER}','ANALYST_EARNING','EARNINGS',2550,2550,'${PAYMENT}');`,
);
await expectReject(
  'BalanceTransaction_paymentId_kind: one payment earns once, however often the webhook arrives',
  UNIQUE_VIOLATION,
  `INSERT INTO "BalanceTransaction"(id,"userId",kind,account,"amountMinor","balanceAfterMinor","paymentId")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000005','${USER}','ANALYST_EARNING','EARNINGS',2550,5100,'${PAYMENT}');`,
);
await expectAccept(
  'the same payment may still be reversed once',
  `INSERT INTO "BalanceTransaction"(id,"userId",kind,account,"amountMinor","balanceAfterMinor","paymentId")
   VALUES ('aaaaaaaa-0000-4000-8000-000000000006','${USER}','ANALYST_EARNING_REVERSAL','EARNINGS',-2550,0,'${PAYMENT}');`,
);

// --- a bet is a claim, and a claim has one shape --------------------------

await expectReject(
  'Prediction_odds_positive: odds at evens or below',
  CHECK_VIOLATION,
  bet('bbbbbbbb-0000-4000-8000-000000000001', '', '').replace('1850', '1000'),
);

await expectReject(
  'Prediction_stake_positive: a stake of zero units',
  CHECK_VIOLATION,
  bet(
    'bbbbbbbb-0000-4000-8000-000000000002',
    ',"stakeUnitsCenti"',
    ',0',
  ),
);

await expectReject(
  'PredictionResult_outcome_is_terminal: settling a bet as still pending',
  CHECK_VIOLATION,
  `INSERT INTO "PredictionResult"(id,"predictionId",outcome,"profitUnitsCenti","settlementSource")
   VALUES ('cccccccc-0000-4000-8000-000000000001','${BET}','PENDING',0,'ბუკმეკერი');`,
);

/*
 * One result per bet. The settle path is an admin pressing a button, and a
 * double click must not be able to write the record twice.
 */
await must(
  'settling the bet once',
  `INSERT INTO "PredictionResult"(id,"predictionId",outcome,"profitUnitsCenti","settlementSource")
   VALUES ('cccccccc-0000-4000-8000-000000000002','${BET}','WON',85,'ბუკმეკერი');`,
);
await expectReject(
  'PredictionResult_predictionId: a bet settles once',
  UNIQUE_VIOLATION,
  `INSERT INTO "PredictionResult"(id,"predictionId",outcome,"profitUnitsCenti","settlementSource")
   VALUES ('cccccccc-0000-4000-8000-000000000003','${BET}','LOST',-100,'ბუკმეკერი');`,
);

// The legs of a slip are ordered, and two legs cannot claim the same place.
await must(
  'first leg',
  `INSERT INTO "PredictionSelection"(id,"predictionId",position,"eventKa","pickKa","oddsMilli")
   VALUES ('dddddddd-0000-4000-8000-000000000001','${BET}',1,'დინამო vs საბურთალო','ჯამური 2.5+',1850);`,
);
await expectReject(
  'PredictionSelection_predictionId_position: one leg per position',
  UNIQUE_VIOLATION,
  `INSERT INTO "PredictionSelection"(id,"predictionId",position,"eventKa","pickKa","oddsMilli")
   VALUES ('dddddddd-0000-4000-8000-000000000002','${BET}',1,'სხვა მატჩი','სხვა არჩევანი',2000);`,
);

// --- what somebody paid for, they paid for once ---------------------------

await must(
  'buying the ticket',
  `INSERT INTO "PredictionPurchase"(id,"userId","predictionId","amountMinor")
   VALUES ('eeeeeeee-0000-4000-8000-000000000001','${USER}','${BET}',1500);`,
);
await expectReject(
  'PredictionPurchase_userId_predictionId: the same ticket is bought once',
  UNIQUE_VIOLATION,
  `INSERT INTO "PredictionPurchase"(id,"userId","predictionId","amountMinor")
   VALUES ('eeeeeeee-0000-4000-8000-000000000002','${USER}','${BET}',1500);`,
);

/*
 * A partial unique index, and the partiality is the point: one ACTIVE
 * subscription per (user, plan), while the cancelled ones stay as history so
 * a resubscribe does not have to overwrite the past.
 */
await must(
  'subscribing',
  `INSERT INTO "UserSubscription"(id,"userId","planId",status,"updatedAt")
   VALUES ('ffffffff-0000-4000-8000-000000000001','${USER}','${PLAN}','ACTIVE',now());`,
);
await expectReject(
  'UserSubscription_active_key: one active subscription per plan',
  UNIQUE_VIOLATION,
  `INSERT INTO "UserSubscription"(id,"userId","planId",status,"updatedAt")
   VALUES ('ffffffff-0000-4000-8000-000000000002','${USER}','${PLAN}','ACTIVE',now());`,
);
await expectAccept(
  'a cancelled subscription for the same plan is kept as history',
  `INSERT INTO "UserSubscription"(id,"userId","planId",status,"updatedAt")
   VALUES ('ffffffff-0000-4000-8000-000000000003','${USER}','${PLAN}','CANCELED',now());`,
);

// --- a report points at exactly one thing ---------------------------------

await expectReject(
  'Report_target_matches_type: an ANALYST report with no analyst',
  CHECK_VIOLATION,
  `INSERT INTO "Report"(id,"targetType",reason,"updatedAt")
   VALUES ('99999999-0000-4000-8000-000000000001','ANALYST','SPAM',now());`,
);
await expectReject(
  'Report_target_matches_type: a report pointing at both an analyst and a bet',
  CHECK_VIOLATION,
  `INSERT INTO "Report"(id,"targetType",reason,"analystProfileId","predictionId","updatedAt")
   VALUES ('99999999-0000-4000-8000-000000000002','PREDICTION','SPAM','${ANALYST}','${BET}',now());`,
);
await expectAccept(
  'a report against one analyst',
  `INSERT INTO "Report"(id,"targetType",reason,"analystProfileId","updatedAt")
   VALUES ('99999999-0000-4000-8000-000000000003','ANALYST','SPAM','${ANALYST}',now());`,
);

/*
 * Coverage, so this file cannot rot quietly again. Every CHECK constraint in
 * the migrated database is named below; add one to the schema without a probe
 * and the run fails here rather than in six months, in production.
 */
const PROBED_CHECKS = [
  'AnalystPayout_amount_positive',
  'BalanceTransaction_amount_nonzero',
  'Payment_amount_positive',
  'PredictionResult_outcome_is_terminal',
  'Prediction_odds_positive',
  'Prediction_stake_positive',
  'Report_target_matches_type',
];
const found = checkRows.map((row) => row.conname).sort();
const unprobed = found.filter((name) => !PROBED_CHECKS.includes(name));
const missing = PROBED_CHECKS.filter((name) => !found.includes(name));
if (unprobed.length > 0) {
  console.error(
    `\nUNPROBED CHECK CONSTRAINTS: ${unprobed.join(', ')}` +
      `\n  Add a probe above and list it in PROBED_CHECKS.`,
  );
  process.exitCode = 1;
}
if (missing.length > 0) {
  console.error(
    `\nPROBED_CHECKS names a constraint the database does not have: ${missing.join(', ')}` +
      `\n  It was renamed or dropped; update the probe rather than the expectation.`,
  );
  process.exitCode = 1;
}

const failed = Boolean(process.exitCode);
console.log(
  failed
    ? '\nmigration verification FAILED'
    : `\nmigration verification complete: ${found.length} check constraints, all probed`,
);

await db.close();

/*
 * Said again, last, and as a hard exit. Closing PGlite tears down a WASM
 * runtime that resets the process exit status on its way out, so a run that
 * printed FAILED still left 0 behind - a verifier that reports a breach and
 * then tells CI everything is fine is worse than no verifier at all.
 */
process.exit(failed ? 1 : 0);
