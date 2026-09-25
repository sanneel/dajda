import { requireAdmin } from '@/lib/auth/authorization';
import { getPaymentProvider, FLITT_PROVIDER_CODE } from '@/lib/payments';
import {
  LIVE_TEST_AMOUNT_MINOR,
  LIVE_TEST_MAX_RENEWALS,
  recentCancellationTests,
} from '@/lib/subscriptions/live-test';
import { Alert } from '@/components/ui/feedback';
import { TestControls } from './controls';

/**
 * Does a cancellation actually stop the card being charged?
 *
 * Nothing on the server can answer that. Our cancel path calls the gateway's
 * stop and refuses to record a cancellation the gateway did not accept, but a
 * calendar that keeps charging after an accepted stop is indistinguishable,
 * from here, from one that was never opened. The only witness is a card.
 *
 * So the page runs the one experiment that separates the cases: two identical
 * calendars on one card, one stopped through the same call the customer's
 * cancel button makes, one left alone. Which of them is charged an hour later
 * is the answer, and it is not open to interpretation.
 */
export const dynamic = 'force-dynamic';

export default async function SubscriptionTestPage() {
  // The layout's check does not guard this page: an RSC request can render
  // the page segment without the layout. Every admin page checks for itself.
  await requireAdmin();
  const provider = getPaymentProvider();
  const live = provider.code === FLITT_PROVIDER_CODE;
  const tests = await recentCancellationTests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">გამოწერის ტესტი</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          ორი ერთნაირი გამოწერა ერთსა და იმავე ბარათზე. ერთს ვაჩერებთ, მეორეს
          არა. რომელს ჩამოეჭრება — ეს არის პასუხი.
        </p>
      </div>

      {!live ? (
        <Alert tone="warning">
          გადახდის პროვაიდერია <span className="tabular">{provider.code}</span>,
          და არა Flitt. სატესტო პროვაიდერზე გაშვებული ტესტი არაფერს ამტკიცებს.
        </Alert>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">რა მოხდება</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
          <li>
            ორივე ბმულს ერთი და იმავე ბარათით იხდი —{' '}
            <span className="tabular">
              {(LIVE_TEST_AMOUNT_MINOR / 100).toFixed(2)}
            </span>{' '}
            ლარი თითო.
          </li>
          <li>
            A-ს აჩერებ აქვე, ღილაკით. ეს იგივე გამოძახებაა, რასაც მომხმარებლის
            „გამოწერის გაუქმება“ აკეთებს.
          </li>
          <li>B-ს ხელს არ ახლებ. ის საკონტროლოა.</li>
          <li>
            დანიშნულ დროს ბარათს უყურებ: B ჩამოეჭრა და A არა — გაუქმება
            მუშაობს. ორივეს ჩამოეჭრა — ჩვენი გაჩერება gateway-მდე არ აღწევს.
            არცერთს — კალენდარი საერთოდ არ იხსნება.
          </li>
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
          თითოეული კალენდარი თავისით სრულდება{' '}
          <span className="tabular">{LIVE_TEST_MAX_RENEWALS}</span> განახლების
          შემდეგ, მაშინაც კი, თუ გაჩერება არ იმუშავებს. ესაა ამ ტესტის
          უსაფრთხოება: მაქსიმალური ხარჯი{' '}
          <span className="tabular">
            {(
              (LIVE_TEST_AMOUNT_MINOR / 100) *
              2 *
              (LIVE_TEST_MAX_RENEWALS + 1)
            ).toFixed(2)}
          </span>{' '}
          ლარი. ეს შეკვეთები საიტის გამოწერებს არ ქმნის და არავის წვდომას არ
          ცვლის.
        </p>
      </section>

      <TestControls initial={tests} />

      <p className="text-xs text-ink-faint">
        ყველა ნაბიჯი იწერება აუდიტის ჟურნალში.
      </p>
    </div>
  );
}
