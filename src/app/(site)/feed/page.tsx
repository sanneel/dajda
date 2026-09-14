import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { activePlanGrants, purchasedTicketIds } from '@/lib/queries/tickets';
import { personalFeed, type FeedEntry } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { EmptyState } from '@/components/ui/feedback';
import { ButtonLink } from '@/components/ui/button';

/**
 * What the people this reader pays for and follows have posted.
 *
 * The rest of the site is arranged by the thing - free bets here, paid bets
 * there, one author's record on their page - which is right for choosing an
 * author and wrong for keeping up with one you already chose. This page is
 * arranged by the people instead, and it is the only page where the question
 * is "what is new" rather than "who is good".
 *
 * A paid bet still arrives locked unless it was paid for. Following an author
 * is an interest, not an entitlement, and a subscription to one author is not
 * a key to another's PREMIUM tickets - so the same rule that governs the
 * public pages governs this one, computed the same way.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ფიდი',
  robots: { index: false, follow: false },
};

export default async function FeedPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect('/login?next=/feed');

  const [entries, grants, purchased] = await Promise.all([
    personalFeed(actor.userId),
    activePlanGrants(actor.userId),
    purchasedTicketIds(actor.userId),
  ]);

  const viewer = {
    role: actor.role,
    analystProfileId: actor.analystProfileId,
  };

  const lockedBetIds = new Set<string>(
    entries.flatMap((entry: FeedEntry) =>
      entry.type === 'bet' &&
      isTicketLocked(
        {
          visibility: entry.bet.visibility,
          authorId: entry.bet.authorId,
          status: entry.bet.status,
        },
        viewer,
        grants,
        purchased.has(entry.bet.id),
      )
        ? [entry.bet.id]
        : [],
    ),
  );

  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink">ფიდი</h1>
        <p className="mt-1 text-sm text-ink-muted">
          ავტორები, რომლებზეც გამოწერა გაქვთ ან რომლებსაც მიჰყვებით.
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="ფიდი ცარიელია"
          description="აირჩიეთ ავტორი, გამოიწერეთ ან მიჰყევით — და მათი პოსტები და ფსონები აქ მოგროვდება."
          action={<ButtonLink href="/analysts">ავტორების ნახვა</ButtonLink>}
        />
      ) : (
        <Feed entries={entries} showAuthor lockedBetIds={lockedBetIds} />
      )}

      {entries.length > 0 ? (
        <p className="mt-6 text-xs text-ink-faint">
          ვინ ჩანს აქ:{' '}
          <Link href="/account" className="underline">
            გამოწერები ანგარიშზეა
          </Link>
          , მიდევნება კი ავტორის გვერდზე.
        </p>
      ) : null}
    </div>
  );
}
