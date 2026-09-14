/**
 * Prove what a cancellation actually does, on the live gateway, in an hour.
 *
 * The open question is not whether our code calls `stop` - it does, before it
 * touches our database, and a refusal fails the whole cancellation. It is
 * whether the gateway then honours it: a calendar that keeps charging after an
 * accepted stop looks identical, from here, to one that was never opened.
 * Nothing in a portal page answers that. Only a card does.
 *
 * So this opens TWO calendars on one card, a minute apart and identical except
 * for what happens next:
 *
 *   A  is stopped, through the same provider call the site's cancel button makes
 *   B  is left alone, as the control
 *
 * When the first renewal falls due, B is charged and A is not. If both are
 * charged, our cancellation does not work and no subscriber can stop one. If
 * neither is, the calendar never existed and the renewal everyone is bracing
 * for is not coming either.
 *
 * A monthly plan makes that a month's wait. The schedule sent here is the
 * shortest the gateway's API can express - `period: day`, first charge at a
 * time you choose, by default an hour out - so the same answer arrives today.
 * The gateway's smallest unit is a day: an hourly cycle cannot be asked for,
 * but the FIRST charge can be put an hour away, which is the part that answers
 * the question.
 *
 * Real money, a real card, a real merchant. Two charges at the test amount up
 * front, then up to `--renewals` more on B until you stop it. That bound is
 * deliberate: if the stop being tested turns out not to work, it is the only
 * thing that ends the calendar.
 *
 * Usage:
 *   FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... \
 *     npx tsx scripts/subscription-cancel-test.ts open --confirm
 *
 *   --amount <gel>     charge per payment (default 0.10, Flitt's test amount)
 *   --in <90m|2h|1d>   when the first renewal falls due (default 1h)
 *   --start "<ts>"     exact first renewal, "YYYY-MM-DD HH:MM:SS", overrides --in
 *   --renewals <n>     hard cap on renewals per calendar (default 3)
 *   --zone <tz>        timezone the timestamp is written in (default Asia/Tbilisi)
 *
 * Stopping A, reading either, and stopping B afterwards all go through
 * scripts/flitt-subscription-state.ts, which this prints ready to paste.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { FlittPaymentProvider } from '../src/lib/payments/flitt';
import { AppError } from '../src/lib/errors';

const argv = process.argv.slice(2);
const mode = argv[0];

function option(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/subscription-cancel-test.ts open --confirm\n' +
      '\n' +
      '  --amount <gel>    charge per payment (default 0.10)\n' +
      '  --in <90m|2h|1d>  when the first renewal falls due (default 1h)\n' +
      '  --start "<ts>"    exact first renewal, "YYYY-MM-DD HH:MM:SS"\n' +
      '  --renewals <n>    hard cap on renewals per calendar (default 3)\n' +
      '  --zone <tz>       timezone for the timestamp (default Asia/Tbilisi)\n' +
      '\n' +
      'This charges a real card. --confirm is required.\n',
  );
  process.exit(2);
}

if (mode !== 'open') usage();

const merchantId = process.env.FLITT_MERCHANT_ID;
const secretKey = process.env.FLITT_SECRET_KEY;
const apiUrl = process.env.FLITT_API_URL ?? 'https://pay.flitt.com';
const appUrl = process.env.APP_URL ?? 'https://dajda.ge';

if (!merchantId || !secretKey) {
  console.error(
    'FLITT_MERCHANT_ID and FLITT_SECRET_KEY are required (portal.flitt.com).\n',
  );
  process.exit(2);
}

const amountGel = Number(option('amount') ?? '0.10');
if (!Number.isFinite(amountGel) || amountGel < 0.1 || amountGel > 5) {
  console.error('--amount must be between 0.10 and 5 GEL for a test.\n');
  process.exit(2);
}
const amountMinor = Math.round(amountGel * 100);

const maxRenewals = Number(option('renewals') ?? '3');
if (!Number.isInteger(maxRenewals) || maxRenewals < 1 || maxRenewals > 10) {
  console.error('--renewals must be a whole number between 1 and 10.\n');
  process.exit(2);
}

const zone = option('zone') ?? 'Asia/Tbilisi';

function stamp(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function firstCharge(): { startTime: string; due: Date } {
  const explicit = option('start');
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(explicit)) {
      console.error('--start must look like "2026-09-14 18:00:00".\n');
      process.exit(2);
    }
    return { startTime: explicit, due: new Date(explicit.replace(' ', 'T')) };
  }

  const spec = option('in') ?? '1h';
  const match = /^(\d+)([mhd])$/.exec(spec);
  if (!match) {
    console.error('--in must look like 90m, 2h or 1d.\n');
    process.exit(2);
  }
  const size = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'm' | 'h' | 'd'];
  const due = new Date(Date.now() + Number(match[1]) * size);
  return { startTime: stamp(due, zone), due };
}

if (!argv.includes('--confirm')) {
  const { startTime, due } = firstCharge();
  console.error(
    `\nThis opens two live calendars on merchant ${merchantId}.\n\n` +
      `  now           ${(amountMinor / 100).toFixed(2)} GEL x 2, one per calendar\n` +
      `  first renewal ${startTime} (${zone}), in ${Math.round((due.getTime() - Date.now()) / 60000)} minutes\n` +
      `  then          daily, up to ${maxRenewals} renewals per calendar\n` +
      `  worst case    ${((amountMinor / 100) * 2 * (maxRenewals + 1)).toFixed(2)} GEL if nothing stops\n\n` +
      'Re-run with --confirm to go ahead.\n',
  );
  process.exit(2);
}

const provider = new FlittPaymentProvider({
  merchantId,
  secretKey,
  webhookSecret: process.env.FLITT_WEBHOOK_SECRET ?? secretKey,
  apiUrl,
});

function reason(error: unknown): string {
  if (error instanceof AppError && error.internalDetail) {
    return error.internalDetail;
  }
  return error instanceof Error ? error.message : String(error);
}

async function open(
  label: string,
  startTime: string,
): Promise<{ orderId: string; url: string } | null> {
  const orderId = `canceltest-${label}-${randomUUID().slice(0, 8)}`;
  try {
    const session = await provider.createCheckoutSession({
      orderId,
      amountMinor,
      currency: 'GEL',
      description: `DAJDA cancellation test ${label.toUpperCase()}`,
      returnUrl: `${appUrl}/account`,
      callbackUrl: `${appUrl}/api/webhooks/payments/flitt`,
      subscription: {
        every: 1,
        period: 'day',
        startDate: startTime,
        maxRenewals,
      },
      requestCardToken: true,
    });
    return { orderId, url: session.checkoutUrl };
  } catch (error) {
    console.log(`  ${label.toUpperCase()} REFUSED  ${reason(error)}`);
    return null;
  }
}

async function main(): Promise<void> {
  const { startTime, due } = firstCharge();

  console.log(`\nCancellation test - merchant ${merchantId} at ${apiUrl}`);
  console.log(`First renewal ${startTime} (${zone}); ${stamp(due, 'UTC')} UTC.`);
  console.log(
    'If the gateway reads that timestamp in a different zone than it was\n' +
      'written in, the charge lands that many hours off. Either way the\n' +
      'comparison between A and B holds.\n',
  );

  const a = await open('a', startTime);
  const b = await open('b', startTime);

  if (!a || !b) {
    console.log(
      '\nBoth calendars are needed for the comparison to mean anything.\n' +
        'If one was refused, nothing has been paid yet - open neither link.\n' +
        'Run `npm run probe:recurring` first; it says whether this merchant\n' +
        'may open a calendar at all.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`  A (will be stopped)  ${a.orderId}`);
  console.log(`     ${a.url}\n`);
  console.log(`  B (control)          ${b.orderId}`);
  console.log(`     ${b.url}\n`);

  console.log('---\n');
  console.log('1. Pay both links with the same card. Two charges of');
  console.log(`   ${(amountMinor / 100).toFixed(2)} GEL; the calendars start after them.\n`);
  console.log('2. Stop A - the same provider call the cancel button makes:\n');
  console.log(`   npm run subscription:state stop ${a.orderId}\n`);
  console.log('3. Read both back. A stopped calendar and a live one differ here:\n');
  console.log(`   npm run subscription:state status ${a.orderId}`);
  console.log(`   npm run subscription:state status ${b.orderId}\n`);
  console.log(`4. After ${startTime}, look at the card and the portal.\n`);
  console.log('   B charged, A not   the cancellation works; a subscriber who');
  console.log('                      cancels really is not charged again.');
  console.log('   both charged       our stop does not reach the calendar. Stop');
  console.log('                      B at once and do not sell a subscription');
  console.log('                      until it does.');
  console.log('   neither charged    no calendar was opened. Then nothing here');
  console.log('                      renews, and no existing card is due either.\n');
  console.log('5. Stop B when you are done:\n');
  console.log(`   npm run subscription:state stop ${b.orderId}\n`);
  console.log(
    `Both calendars end by themselves after ${maxRenewals} renewals even if\n` +
      'every stop fails. That bound is the whole safety of this test.\n',
  );
  console.log(
    'The callbacks go to the live site, which has no order rows for these\n' +
      'ids and will log them as unknown and ignore them. That is intended:\n' +
      'this tests the gateway and our stop call, not our bookkeeping.',
  );
}

main().catch((error) => {
  console.error('test setup failed:', reason(error));
  process.exitCode = 1;
});
