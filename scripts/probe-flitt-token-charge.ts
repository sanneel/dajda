/**
 * Charge a saved card token ourselves and see what the gateway says.
 *
 * The renewal calendar's own charge on an Apple Pay token was declined on
 * 2026-09-27 with 1011 "Parameter {param_name} is missing": the portal never
 * filled in the name. This sends the same kind of charge from our side,
 * through /api/recurring, where the answer comes back in the same request and
 * may name what is missing. It tries a short sequence of variants:
 *
 *   1. base     the documented mandatory parameters, exactly as
 *               FlittPaymentProvider.chargeRecurring sends them
 *   2. version  the same plus version=1.0.1, the documented default that we
 *               never send ("1.0 is deprecated")
 *   3. extras   the same plus any key=value pairs given on the command line
 *               (only when some are given)
 *
 * THIS CHARGES A REAL CARD. Each attempt is 0.10 GEL. A declined attempt
 * moves no money. The first approved attempt stops the run and is reversed
 * at once, so at most 0.10 GEL is taken and then returned. Without --send it
 * only prints what it would send.
 *
 * What the answer means:
 *   approved        our own charge works on this token, so the calendar's
 *                   request is what is broken, and renewals could be run
 *                   from our side instead
 *   1011 <name>     that is the missing parameter
 *   1059 / 1060     /api/recurring is not enabled for this merchant in
 *                   production (the docs say support must switch it on)
 *   1035/1078/1082  the token itself is gone, deactivated or expired
 *
 * Usage:
 *   FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... FLITT_RECTOKEN=... \
 *     npx tsx scripts/probe-flitt-token-charge.ts [--send] [key=value ...]
 *
 * FLITT_RECTOKEN is the "Rectoken" on the order's page in portal.flitt.com.
 * The callbacks go to the live webhook, which files them as "no matching
 * payment": the order ids are this script's own, never a customer's.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  FlittPaymentProvider,
  flittSignature,
  redactCardToken,
  type FlittParams,
} from '../src/lib/payments/flitt';

const merchantId = process.env.FLITT_MERCHANT_ID;
const secretKey = process.env.FLITT_SECRET_KEY;
const rectoken = process.env.FLITT_RECTOKEN;
const apiUrl = process.env.FLITT_API_URL ?? 'https://pay.flitt.com';
const appUrl = process.env.PROBE_APP_URL ?? 'https://dajda.ge';

const args = process.argv.slice(2);
const send = args.includes('--send');
const extras = Object.fromEntries(
  args
    .filter((arg) => arg !== '--send')
    .map((arg) => {
      const at = arg.indexOf('=');
      if (at <= 0) {
        console.error(`Not a key=value pair: ${arg}`);
        process.exit(2);
      }
      return [arg.slice(0, at), arg.slice(at + 1)];
    }),
) as Record<string, string>;

if (!merchantId || !secretKey || !rectoken) {
  console.error(
    'FLITT_MERCHANT_ID, FLITT_SECRET_KEY and FLITT_RECTOKEN are required.\n\n' +
      '  FLITT_MERCHANT_ID=... FLITT_SECRET_KEY=... FLITT_RECTOKEN=... \\\n' +
      '    npx tsx scripts/probe-flitt-token-charge.ts [--send] [key=value ...]\n',
  );
  process.exit(2);
}

/** 0.10 GEL, the amount Flitt asked for on live tests. */
const AMOUNT_MINOR = 10;

const provider = new FlittPaymentProvider({
  merchantId,
  secretKey,
  webhookSecret: secretKey,
  apiUrl,
});

type Variant = { name: string; extra: FlittParams };

const variants: Variant[] = [
  { name: 'base', extra: {} },
  { name: 'version', extra: { version: '1.0.1' } },
  ...(Object.keys(extras).length > 0
    ? [{ name: 'extras', extra: { version: '1.0.1', ...extras } }]
    : []),
];

function baseRequest(orderId: string): FlittParams {
  return {
    merchant_id: merchantId as string,
    order_id: orderId,
    order_desc: 'DAJDA recurring probe',
    amount: AMOUNT_MINOR,
    currency: 'GEL',
    rectoken: rectoken as string,
    server_callback_url: `${appUrl}/api/webhooks/payments/flitt`,
  };
}

async function charge(request: FlittParams): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiUrl}/api/recurring`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: { ...request, signature: flittSignature(request, secretKey as string) },
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    response?: Record<string, unknown>;
  } | null;
  return body?.response ?? { http_status: response.status, body };
}

/** An approval is reversed at once; a charge still processing is waited on. */
async function settle(orderId: string, answer: Record<string, unknown>) {
  let status = String(answer.order_status ?? '');
  for (let tries = 0; status === 'processing' && tries < 10; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    status = (await provider.verifyPayment({ orderId })).rawStatus;
    console.log(`    status check: ${status}`);
  }
  if (status !== 'approved') return status;

  const reversal = await provider.refundPayment({
    orderId,
    amountMinor: AMOUNT_MINOR,
    currency: 'GEL',
    reason: 'DAJDA recurring probe, returned at once',
  });
  console.log(
    `    reversed: ${reversal.status} (${reversal.rawStatus}${
      reversal.message ? `, ${reversal.message}` : ''
    })`,
  );
  if (reversal.status !== 'ACCEPTED') {
    console.log(`    REVERSE BY HAND in the portal: order ${orderId}`);
  }
  return status;
}

async function main(): Promise<void> {
  console.log(`\nFlitt token charge probe, merchant ${merchantId} at ${apiUrl}`);
  console.log(
    send
      ? `LIVE: each attempt charges ${(AMOUNT_MINOR / 100).toFixed(2)} GEL; an approval is reversed at once.\n`
      : 'Dry run: nothing is sent. Add --send to charge.\n',
  );

  const summary: string[] = [];
  for (const variant of variants) {
    const orderId = `probe-rec-${variant.name}-${randomUUID().slice(0, 8)}`;
    const request = { ...baseRequest(orderId), ...variant.extra };

    console.log(`${variant.name}: ${orderId}`);
    console.log(`  sent ${JSON.stringify(redactCardToken(request))}`);
    if (!send) continue;

    const answer = await charge(request);
    console.log(`  got  ${JSON.stringify(redactCardToken(answer))}`);

    const outcome =
      answer.response_status === 'failure'
        ? `${answer.error_code ?? '?'} ${answer.error_message ?? ''}`.trim()
        : [
            String(answer.order_status ?? '?'),
            answer.response_code ? String(answer.response_code) : '',
            answer.response_description ? String(answer.response_description) : '',
          ]
            .filter(Boolean)
            .join(' ');
    const status = await settle(orderId, answer);
    const settled =
      status !== '' && status !== String(answer.order_status ?? '')
        ? ` -> ${status}`
        : '';
    summary.push(`  ${variant.name.padEnd(8)} ${outcome}${settled}`);
    if (status === 'approved') {
      summary.push('  (stopped: an approval answers the question)');
      break;
    }
    console.log('');
  }

  if (send) {
    console.log('\n---\nSummary');
    console.log(summary.join('\n'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
