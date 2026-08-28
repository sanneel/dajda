import 'dotenv/config';
import process from 'node:process';
import { getEnv } from '../src/lib/env';
import { getEmailProvider } from '../src/lib/notifications/email';
import { renderEmailHtml } from '../src/lib/notifications/email/template';

/**
 * Sends one real message through the configured provider.
 *
 * Without this the only way to find out whether email works is to register an
 * account and wait for something that may never arrive, with no way to tell a
 * wrong API key from an unverified domain from a message sitting in spam. This
 * goes through the SAME adapter the app uses - not a re-implementation - so a
 * success here means registration mail will send too.
 *
 *   npm run email:test -- you@example.com
 *
 * What it cannot tell you: whether the message reached the inbox rather than
 * the spam folder. That is decided by the SPF and DKIM records on the sending
 * domain, and only opening the mail will show it.
 */
// Wrapped rather than using top-level await: tsx compiles this to CommonJS.
async function main() {
  const to = process.argv.slice(2).find((arg) => arg.includes('@'));

  if (!to) {
    console.error(
      '\nUsage: npm run email:test -- you@example.com\n' +
        'Pass the address to send to.\n',
    );
    process.exit(1);
  }

  // Reading the environment validates it, so a misconfiguration is reported
  // here as the same error the app would refuse to boot with.
  const env = getEnv();
  const provider = getEmailProvider();

  console.info(`\nProvider: ${provider.code}`);
  console.info(`From:     ${env.EMAIL_FROM ?? '(unset)'}`);
  console.info(`To:       ${to}`);

  if (provider.code === 'log') {
    console.warn(
      '\nEMAIL_PROVIDER is "log", so nothing is sent anywhere: the message is\n' +
        'printed below and that is all. Set EMAIL_PROVIDER, EMAIL_API_KEY and\n' +
        'EMAIL_FROM to send for real.\n',
    );
  }

  const result = await provider.send({
    to,
    subject: 'DAJDA: სატესტო წერილი',
    text: [
      'ეს არის სატესტო წერილი DAJDA-დან.',
      '',
      'თუ ეს მოგივიდათ, ელფოსტის ინტეგრაცია მუშაობს და რეგისტრაციის',
      'დადასტურების ბმულიც მიაღწევს ადრესატამდე.',
      '',
      'DAJDA · dajda.ge',
    ].join('\n'),
    // The same template every real mail uses, so what lands in the inbox is
    // what a registration mail will actually look like.
    html: renderEmailHtml({
      heading: 'სატესტო წერილი',
      paragraphs: [
        'ეს არის სატესტო წერილი DAJDA-დან.',
        'თუ ეს მოგივიდათ, ელფოსტის ინტეგრაცია მუშაობს და რეგისტრაციის დადასტურების ბმულიც მიაღწევს ადრესატამდე.',
      ],
      cta: { label: 'DAJDA-ს გახსნა', url: 'https://dajda.ge' },
    }),
  });

  if (result.ok) {
    console.info('\nAccepted by the provider.');
    console.info(
      'That means the API call succeeded, NOT that it reached an inbox.\n' +
        'Open the mailbox, and check the spam folder before concluding it worked.\n',
    );
    process.exit(0);
  }

  console.error(`\nRefused: ${result.reason}`);

  /*
   * Tell a blocked network apart from a rejected key.
   *
   * A proxy that refuses the CONNECT answers with the provider's own status
   * codes, so the adapter cannot see the difference and reports a plain 403 -
   * which reads exactly like a bad API key and sends the reader off checking
   * credentials that were never the problem. The request in that case never
   * reached the provider at all.
   */
  const blocked = /not in allowlist|egress|proxy|tunnel|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(
    result.reason,
  );

  if (blocked) {
    console.error(
      'That refusal came from a network policy, not from the provider: the\n' +
        'request never left this machine, so the API key is still untested.\n' +
        'Allow api.resend.com (or api.brevo.com) through the proxy, or run this\n' +
        'command somewhere with open outbound HTTPS.\n',
    );
  } else if (result.permanent) {
    console.error(
      'This will not succeed on a retry. Usual causes: a wrong API key, or an\n' +
        'EMAIL_FROM on a domain the provider has not verified yet. With\n' +
        'onboarding@resend.dev the recipient must be your own Resend account\n' +
        'address - Resend refuses anything else.\n',
    );
  } else {
    console.error(
      'Transient - the provider is rate limiting or having trouble. Try again.\n',
    );
  }
  process.exit(1);

}

main();
