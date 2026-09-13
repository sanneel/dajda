/**
 * Ask the live gateway whether this merchant may open a renewal calendar.
 *
 * Creating a checkout URL moves no money: the gateway validates the order and
 * answers with a link nobody has to open. So this is a safe question to ask a
 * production merchant, and it is the only way to find out - the annex does not
 * mention recurring either way, and a permission the merchant profile does not
 * carry shows up as a refusal here rather than as a setting anyone can read.
 *
 * It sends two orders through the SAME adapter the product uses:
 *
 *   1. a plain checkout, as a control - proves the credentials and the
 *      signature are right, so that a refusal of (2) means what it says
 *   2. a subscription checkout - subscription=Y with recurring_data, signed
 *      as protocol 2.0, plus required_rectoken=Y
 *
 * If (1) passes and (2) is refused, recurring is not enabled for this
 * merchant. If both pass, the checkout side is enabled - see the note the
 * script prints about what is still unproven until a card is actually charged.
 *
 * Usage:
 *   FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... npx tsx scripts/probe-flitt-recurring.ts
 *
 * Credentials come from portal.flitt.com. Nothing is written to a database and
 * no card is charged.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { FlittPaymentProvider } from '../src/lib/payments/flitt';
import { renewalRequest } from '../src/lib/subscriptions/checkout-rules';
import { AppError } from '../src/lib/errors';

const merchantId = process.env.FLITT_MERCHANT_ID;
const secretKey = process.env.FLITT_SECRET_KEY;
const apiUrl = process.env.FLITT_API_URL ?? 'https://pay.flitt.com';
const appUrl = process.env.APP_URL ?? 'https://dajda.ge';

if (!merchantId || !secretKey) {
  console.error(
    'FLITT_MERCHANT_ID and FLITT_SECRET_KEY are required.\n' +
      'Take them from portal.flitt.com and pass them on the command line:\n\n' +
      '  FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... npx tsx scripts/probe-flitt-recurring.ts\n',
  );
  process.exit(2);
}

/** 0.10 GEL - the amount Flitt asked for live tests, in tetri. */
const AMOUNT_MINOR = 10;

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

async function attempt(label: string, recurring: boolean): Promise<boolean> {
  const orderId = `probe-${recurring ? 'sub' : 'plain'}-${randomUUID().slice(0, 8)}`;
  console.log(label);
  try {
    const session = await provider.createCheckoutSession({
      orderId,
      amountMinor: AMOUNT_MINOR,
      currency: 'GEL',
      description: 'DAJDA recurring capability probe',
      returnUrl: `${appUrl}/dashboard`,
      callbackUrl: `${appUrl}/api/webhooks/payments/flitt`,
      ...(renewalRequest(recurring, 'MONTHLY', new Date()) ?? {}),
    });
    console.log(`  ACCEPTED  ${session.checkoutUrl}\n`);
    return true;
  } catch (error) {
    console.log(`  REFUSED   ${reason(error)}\n`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`\nFlitt recurring probe - merchant ${merchantId} at ${apiUrl}`);
  console.log('No card is charged; these calls only ask for a checkout link.\n');

  const plain = await attempt('1. plain checkout (control)', false);
  const subscription = await attempt('2. subscription checkout', true);

  console.log('---');
  if (!plain) {
    console.log(
      'The control order was refused, so this says nothing about recurring:\n' +
        'the credentials, the signature or the merchant itself are the problem.\n' +
        'Fix that first, then run this again.',
    );
    process.exitCode = 1;
    return;
  }
  if (!subscription) {
    console.log(
      'Plain checkouts work and subscription checkouts do not: recurring is\n' +
        'NOT enabled for this merchant. The refusal above is what to quote to\n' +
        'Flitt support when asking them to turn it on.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    'Both were accepted: the gateway takes a renewal calendar from this\n' +
      'merchant, so recurring is enabled on the checkout side.\n\n' +
      'Still unproven until a real card goes through, because a gateway can\n' +
      'accept a calendar at checkout and decline it at payment:\n' +
      '  - that the callback carries rectoken (required_rectoken=Y honoured)\n' +
      '  - that the calendar charges on its date and posts a renewal webhook\n' +
      '    naming parent_order_id\n' +
      'Open the checkout URL above, pay the 0.10 GEL, and check the callback.',
  );
}

main().catch((error) => {
  console.error('probe failed:', reason(error));
  process.exitCode = 1;
});
