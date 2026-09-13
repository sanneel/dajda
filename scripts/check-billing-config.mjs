/**
 * Refuse to build a deployment whose billing config contradicts its terms.
 *
 * A charge the customer did not initiate is only defensible if the terms they
 * agreed to describe it. SUBSCRIPTION_RECURRING says what the operator wants;
 * the billing-mode marker in docs/legal/terms.md says what the published terms
 * promise. This is where the two are required to agree.
 *
 * It runs at BUILD time, on purpose. The check used to live in the environment
 * schema, where a contradiction threw on every request - and because the site
 * header reads env, that meant every page answered 500 while the deployment
 * itself reported success. A configuration mistake should fail the deploy,
 * visibly and before any traffic, not the site afterwards. At runtime the same
 * contradiction now merely degrades (see lib/subscriptions/recurring.ts).
 *
 * Also catches a terms.md edited without `npm run legal:sync`, which would
 * leave the site rendering one set of clauses and the marker claiming another.
 *
 * Wired into vercel-build. Run by hand with:  npm run check:billing
 */
import { readFileSync } from 'node:fs';

const MARKER = /<!--\s*billing-mode:\s*(oneoff|recurring)\s*-->/;
const TERMS = 'docs/legal/terms.md';
const GENERATED = 'src/lib/legal/billing-mode.generated.ts';

function fail(message) {
  console.error(`\n  billing config check FAILED\n\n${message}\n`);
  process.exit(1);
}

const termsMatch = MARKER.exec(readFileSync(TERMS, 'utf8'));
if (!termsMatch) {
  fail(
    `  ${TERMS} has no billing-mode marker.\n` +
      '  Add <!-- billing-mode: oneoff --> or <!-- billing-mode: recurring -->\n' +
      '  under the "ბოლო განახლება" line, then run `npm run legal:sync`.',
  );
}
const termsMode = termsMatch[1];

const generatedMatch = /TERMS_BILLING_MODE: BillingMode = '(oneoff|recurring)'/.exec(
  readFileSync(GENERATED, 'utf8'),
);
if (!generatedMatch) {
  fail(`  ${GENERATED} is unreadable. Run \`npm run legal:sync\`.`);
}
const generatedMode = generatedMatch[1];

if (termsMode !== generatedMode) {
  fail(
    `  ${TERMS} says "${termsMode}" but ${GENERATED} says "${generatedMode}".\n` +
      '  The terms were edited without regenerating. Run `npm run legal:sync`\n' +
      '  and commit the result.',
  );
}

const declared = process.env.SUBSCRIPTION_RECURRING === 'true';

if (declared && termsMode !== 'recurring') {
  fail(
    '  SUBSCRIPTION_RECURRING="true" but the published terms still say a card\n' +
      '  is never charged again (billing-mode: oneoff).\n\n' +
      '  Renewing on those terms would break the agreement on the first\n' +
      '  renewal, so this build is refused. Either:\n\n' +
      '    - set SUBSCRIPTION_RECURRING="false" (subscriptions sell one month\n' +
      '      at a time, which is the current published promise), or\n' +
      '    - apply docs/legal/recurring-billing-clauses.md to terms.md after a\n' +
      '      lawyer has reviewed them, flip the marker to "recurring", run\n' +
      '      `npm run legal:sync`, and commit.',
  );
}

console.log(
  `billing config ok - terms: ${termsMode}, recurring: ${declared ? 'on' : 'off'}`,
);
