/**
 * Put the subscription question to the gateway itself.
 *
 * The portal's payment page shows the schedule an order was created with,
 * which is a historical record: a subscription stopped afterwards can still
 * look scheduled there. So "did the cancellation reach Flitt" cannot be read
 * off that page - it has to be asked.
 *
 * This sends /api/subscription for one order and prints the raw answer.
 * `stop` is idempotent in the direction that matters: stopping an already
 * stopped calendar changes nothing, and either way the answer says what the
 * gateway thinks the state is. It cannot charge a card - the only thing this
 * endpoint does is start or stop a calendar.
 *
 * Usage:
 *   FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... \
 *     npx tsx scripts/flitt-subscription-state.ts stop <order-id>
 *
 * The order id is the one the checkout created - visible in the portal as
 * "Order ID", e.g. dajda-4934826a-2aab-4d71-b0ef-a7738cbc391e.
 *
 * `start` is accepted too, for putting back a calendar stopped by mistake.
 */
import 'dotenv/config';
import { FlittPaymentProvider } from '../src/lib/payments/flitt';
import { AppError } from '../src/lib/errors';

const action = process.argv[2];
const orderId = process.argv[3];

if (action !== 'stop' && action !== 'start') {
  console.error(
    'Usage: npx tsx scripts/flitt-subscription-state.ts <stop|start> <order-id>\n',
  );
  process.exit(2);
}
if (!orderId) {
  console.error('An order id is required (the portal calls it "Order ID").\n');
  process.exit(2);
}

const merchantId = process.env.FLITT_MERCHANT_ID;
const secretKey = process.env.FLITT_SECRET_KEY;
if (!merchantId || !secretKey) {
  console.error(
    'FLITT_MERCHANT_ID and FLITT_SECRET_KEY are required (portal.flitt.com).\n',
  );
  process.exit(2);
}

const provider = new FlittPaymentProvider({
  merchantId,
  secretKey,
  webhookSecret: process.env.FLITT_WEBHOOK_SECRET ?? secretKey,
  apiUrl: process.env.FLITT_API_URL ?? 'https://pay.flitt.com',
});

async function main(): Promise<void> {
  console.log(`\n${action} subscription for order ${orderId}\n`);
  try {
    const result = await provider.setSubscriptionState({
      orderId: orderId as string,
      action: action as 'stop' | 'start',
    });
    console.log(`  status   ${result.status}`);
    console.log(`  raw      ${result.rawStatus}`);
    if (result.message) console.log(`  message  ${result.message}`);
    console.log();
    console.log(
      result.status === 'ACCEPTED'
        ? 'The gateway accepted it. The calendar is in the state you asked for.'
        : 'The gateway did NOT accept it. The message above is what it said -\n' +
            'note that a refusal can also mean there is no calendar to act on.',
    );
  } catch (error) {
    const detail =
      error instanceof AppError && error.internalDetail
        ? error.internalDetail
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`  call failed: ${detail}`);
    process.exitCode = 1;
  }
}

main();
