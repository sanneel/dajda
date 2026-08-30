/**
 * Adds a few OPEN, PRICED paid demo tickets so the /paid feed has something
 * to show.
 *
 * The --demo seed is destructive - it empties the database before it runs -
 * so it cannot be used to top up a deployment that already has real accounts
 * on it. This script only ever INSERTS: it finds existing demo analysts and
 * gives each one a couple of open, single-purchase paid tickets, skipping any
 * analyst that already has one so a second run changes nothing.
 *
 *   npx tsx scripts/add-demo-paid-tickets.ts
 *
 * Everything it writes is flagged isDemo: true and dated into the near future,
 * so it appears on /paid (a shop of open tickets) rather than in a record.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/*
 * Its own client from DATABASE_URL alone, deliberately NOT the app's
 * `src/lib/db`: that module runs the full production env validation on import
 * (AUTH_SECRET, APP_URL, payment keys…), none of which a one-off insert needs.
 * A maintenance script should run with a connection string and nothing else.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, keepAlive: true }),
});

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) =>
    c === '<'
      ? '&lt;'
      : c === '>'
        ? '&gt;'
        : c === '&'
          ? '&amp;'
          : c === "'"
            ? '&apos;'
            : '&quot;',
  );

/** A demo bet slip, marked as such across its face, stored in the DB. */
async function makeSlip(lines: string[]): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675">
    <rect width="900" height="675" fill="#0e1013"/>
    <rect x="40" y="40" width="820" height="595" rx="10" fill="#16181c" stroke="#22262b" stroke-width="2"/>
    <text x="80" y="120" fill="#c6f423" font-family="sans-serif" font-size="30" font-weight="700">ფსონის კუპონი</text>
    ${lines
      .map(
        (line, i) =>
          `<text x="80" y="${195 + i * 52}" fill="#e8eaed" font-family="sans-serif" font-size="26">${escapeXml(line)}</text>`,
      )
      .join('')}
    <text x="80" y="600" fill="#5a616b" font-family="sans-serif" font-size="22">დემო სურათი, რეალური კუპონი არ არის</text>
  </svg>`;

  const name = `${randomBytes(16).toString('hex')}.webp`;
  const { data, info } = await sharp(Buffer.from(svg))
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  await prisma.screenshot.create({
    data: {
      name,
      mimeType: 'image/webp',
      bytes: new Uint8Array(data),
      byteSize: data.byteLength,
      width: info.width,
      height: info.height,
    },
  });

  return `/uploads/${name}`;
}

const day = 24 * 60 * 60 * 1000;

const TICKETS = [
  {
    pick: 'რეალი — ბარსელონა',
    market: 'ორივე გაიტანს — კი',
    odds: 1.85,
    priceMinor: 1000,
    inDays: 2,
  },
  {
    pick: 'ლეიკერსი — ბოსტონი',
    market: 'ტოტალი 2.5 — მეტი',
    odds: 2.1,
    priceMinor: 1500,
    inDays: 3,
  },
];

async function main() {
  const analysts = await prisma.analystProfile.findMany({
    where: { isDemo: true, status: 'APPROVED' },
    select: { id: true, userId: true, displayName: true, primarySportId: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });

  if (analysts.length === 0) {
    // Not an error worth failing a build over: a structure-only deployment
    // simply has no demo analysts to attach demo tickets to.
    console.info('No demo analysts found; nothing to top up.');
    return;
  }

  const now = Date.now();
  let created = 0;

  for (const analyst of analysts) {
    // Idempotent: if this analyst already has an open paid ticket, leave them
    // alone so a second run is a no-op.
    const existing = await prisma.prediction.count({
      where: {
        authorId: analyst.id,
        visibility: { in: ['PREMIUM', 'VIP'] },
        priceMinor: { not: null },
        status: 'PENDING',
        finishedAt: null,
        supersededAt: null,
        eventAt: { gt: new Date() },
      },
    });
    if (existing > 0) {
      console.info(
        `${analyst.displayName}: already has ${existing} open paid ticket(s), skipping.`,
      );
      continue;
    }

    if (!analyst.primarySportId) {
      console.info(`${analyst.displayName}: no primary sport, skipping.`);
      continue;
    }

    for (const t of TICKETS) {
      const screenshotPath = await makeSlip([
        t.pick,
        t.market,
        `კოეფიციენტი: ${t.odds.toFixed(2)}`,
        'ფსონი: 1 ერთეული',
      ]);

      await prisma.prediction.create({
        data: {
          author: { connect: { id: analyst.id } },
          postedBy: { connect: { id: analyst.userId } },
          sport: { connect: { id: analyst.primarySportId } },
          screenshotPath,
          titleKa: `${t.pick} · ${t.market}`,
          descriptionKa: `${t.market}. ავტორის დასაბუთება ბილეთის შეძენის შემდეგ ჩანს. დემო ტექსტი.`,
          oddsMilli: Math.round(t.odds * 1000),
          stakeUnitsCenti: 100,
          visibility: 'PREMIUM',
          priceMinor: t.priceMinor,
          publishedAt: new Date(now - 2 * 60 * 60 * 1000),
          eventAt: new Date(now + t.inDays * day),
          status: 'PENDING',
          isDemo: true,
        },
      });
      created += 1;
    }
    console.info(`${analyst.displayName}: added ${TICKETS.length} paid tickets.`);
  }

  console.info(`\nDone. ${created} paid demo ticket(s) created.`);
}

main()
  .catch((error) => {
    // Never fail the caller (this runs inside the Vercel build): a demo
    // top-up that could not run must not block a production deploy. Log it
    // loudly and exit clean.
    console.error('add-demo-paid-tickets failed (non-fatal):', error);
  })
  .finally(() => prisma.$disconnect());
