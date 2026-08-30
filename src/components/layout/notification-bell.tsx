import Link from 'next/link';
import { Bell, Send } from 'lucide-react';
import { prisma } from '@/lib/db';
import { ClosableDetails } from '@/components/ui/closable-details';

/**
 * The bell: the follower's view of what is still open.
 *
 * It lists the unsettled published bets of every analyst this person follows
 * (SavedAnalyst - following IS the save). A settled bet simply stops matching
 * the query, so entries disappear on settlement without any read/unread
 * bookkeeping to maintain - the bell shows the present, not an inbox.
 *
 * A native <details> popover: no JavaScript, works everywhere. While Telegram
 * is not connected the first row is a nudge - the promised "+1 notification".
 */
export async function NotificationBell({ userId }: { userId: string }) {
  const [tickets, me] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        status: 'PENDING',
        publishedAt: { not: null },
        supersededAt: null,
        author: { savedBy: { some: { userId } } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 60,
      select: {
        id: true,
        visibility: true,
        author: { select: { displayName: true, slug: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    }),
  ]);

  /*
   * One line per author-and-kind, not one per ticket: the bell answers
   * "who has something open for me", and "+3" says how much without three
   * rows saying the same name. An entry vanishes as its tickets settle.
   */
  const groups = new Map<
    string,
    { name: string; slug: string; paid: boolean; count: number }
  >();
  for (const ticket of tickets) {
    if (!ticket.author) continue;
    const paid = ticket.visibility !== 'PUBLIC';
    const key = `${ticket.author.slug}:${paid ? 'paid' : 'free'}`;
    const group = groups.get(key) ?? {
      name: ticket.author.displayName,
      slug: ticket.author.slug,
      paid,
      count: 0,
    };
    group.count += 1;
    groups.set(key, group);
  }
  const entries = [...groups.values()];

  const needsTelegram = me?.telegramChatId === null;
  const count = entries.length + (needsTelegram ? 1 : 0);

  return (
    <ClosableDetails className="relative">
      <summary
        className="relative inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted transition-colors marker:content-none hover:bg-elevated hover:text-ink"
        aria-label={`შეტყობინებები (${count})`}
        title="შეტყობინებები"
      >
        <Bell className="size-5" aria-hidden="true" />
        {count > 0 ? (
          <span className="tabular absolute right-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-ink">
            {count}
          </span>
        ) : null}
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-card border border-line bg-surface">
        <p className="border-b border-line px-4 py-2.5 text-xs font-medium text-ink-muted">
          Follow-ში მყოფების ღია ბილეთები
        </p>

        <ul className="max-h-96 divide-y divide-line overflow-y-auto">
          {needsTelegram ? (
            <li>
              <Link
                href="/dashboard/settings"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-elevated"
              >
                <Send className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink">
                    დააკავშირეთ Telegram
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    ახალი ბილეთის შეტყობინება ბოტიდან მყისიერად მოვა.
                  </span>
                </span>
              </Link>
            </li>
          ) : null}

          {entries.map((entry) => (
            <li key={`${entry.slug}:${entry.paid}`}>
              <Link
                href={`/analysts/${entry.slug}?tab=${entry.paid ? 'paid' : 'free'}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-elevated"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink">{entry.name}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · {entry.paid ? 'ფასიანი ბილეთი' : 'უფასო ბილეთი'}
                  </span>
                </span>
                <span className="tabular shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                  +{entry.count}
                </span>
              </Link>
            </li>
          ))}

          {entries.length === 0 && !needsTelegram ? (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">
              ღია ბილეთი არ არის. გააფოლოვეთ ანალიტიკოსი და ახალი ბილეთები
              აქ გამოჩნდება.
            </li>
          ) : null}
        </ul>
      </div>
    </ClosableDetails>
  );
}
