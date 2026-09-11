import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateKa, formatDateTimeKa, formatMoney } from '@/lib/format';
import { PAYOUT_STATUS_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { isWithdrawalWindowOpen, nextWithdrawalWindow } from '@/lib/payouts/rules';
import { revealPayoutIban } from '@/lib/payouts/service';
import { DecidePayoutForm } from './decide-form';
import { PayoutWindowForm } from './window-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'გატანები · ადმინი',
  robots: { index: false, follow: false },
};

/**
 * The payout queue.
 *
 * Money never leaves without somebody here pressing a button, so the row shows
 * what the platform saw of the analyst's month: the activity check is advice
 * for that decision, not a gate that already made it.
 */
export default async function AdminPayoutsPage() {
  await requireAdmin();

  const now = new Date();
  const calendarOpen = isWithdrawalWindowOpen(now);

  /*
   * Every approved author, so the window can be opened for one who has not
   * asked yet - which is the whole point of the control. Ordered by what is
   * unusual first: an override is a state somebody has to remember to undo.
   */
  const analysts = await prisma.analystProfile.findMany({
    where: { status: 'APPROVED' },
    orderBy: [{ payoutWindow: 'desc' }, { displayName: 'asc' }],
    select: {
      id: true,
      displayName: true,
      slug: true,
      payoutWindow: true,
      payoutWindowNote: true,
      payoutWindowSetAt: true,
      user: { select: { email: true, earningsMinor: true } },
    },
  });

  const payouts = await prisma.analystPayout.findMany({
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      status: true,
      maskedAccount: true,
      // Opened on the server for open requests only, so the administrator can
      // make the transfer; it never reaches the page for a decided one.
      accountCipher: true,
      periodStart: true,
      periodEnd: true,
      publicationsInPeriod: true,
      weeksInPeriod: true,
      weeksMeetingMinimum: true,
      activityCheckPassed: true,
      declaredMonthlyMinimum: true,
      failureReason: true,
      // The provider's own words. Admin-only: this is the page where somebody
      // decides whether releasing the request again could possibly work.
      failureDetail: true,
      paymentReference: true,
      rawStatus: true,
      requestedAt: true,
      decidedAt: true,
      analystProfile: {
        select: { displayName: true, slug: true, firstName: true, lastName: true },
      },
      user: { select: { email: true, earningsMinor: true } },
    },
  });

  const open = payouts.filter((payout) => payout.status === 'REQUESTED');
  const rest = payouts.filter((payout) => payout.status !== 'REQUESTED');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          გატანები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ანალიტიკოსების მოთხოვნები. მოთხოვნის შეტანისას თანხა უკვე გამოკლებულია
          მათ ნაშთს, ამიტომ უარყოფა თანხას აბრუნებს.
        </p>
      </header>

      <Card>
        <CardHeader
          title={`განსახილველი (${open.length})`}
          description="თანხა გადარიცხეთ ბანკიდან, შემდეგ მონიშნეთ მოთხოვნა გადახდილად."
        />
        <CardBody>
          {open.length === 0 ? (
            <EmptyState title="განსახილველი მოთხოვნა არ არის" />
          ) : (
            <ul className="divide-y divide-line">
              {open.map((payout) => (
                <li key={payout.id} className="space-y-3 py-4 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <Link
                          href={`/analysts/${payout.analystProfile.slug}`}
                          className="hover:text-accent"
                        >
                          {payout.analystProfile.displayName}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {[
                          [payout.analystProfile.firstName, payout.analystProfile.lastName]
                            .filter(Boolean)
                            .join(' '),
                          payout.user.email,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        {payout.maskedAccount} ·{' '}
                        {formatDateTimeKa(payout.requestedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-lg text-ink">
                        {formatMoney(payout.amountMinor, payout.currency)}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        დარჩენილი ნაშთი:{' '}
                        {formatMoney(payout.user.earningsMinor, 'GEL')}
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      payout.activityCheckPassed
                        ? 'rounded-md border border-line px-3 py-2 text-sm text-ink-muted'
                        : 'rounded-md border border-loss/40 px-3 py-2 text-sm text-ink-muted'
                    }
                  >
                    აქტივობა {formatDateKa(payout.periodStart)} დან{' '}
                    {formatDateKa(payout.periodEnd)} მდე:{' '}
                    <span className="tabular text-ink">
                      {payout.publicationsInPeriod}
                    </span>
                    {payout.declaredMonthlyMinimum !== null ? (
                      <>
                        {' '}პუბლიკაცია, დეკლარირებული{' '}
                        <span className="tabular text-ink">
                          {payout.declaredMonthlyMinimum}
                        </span>
                        . ცარიელი სრული კვირა:{' '}
                        <span className="tabular text-ink">
                          {payout.weeksInPeriod - payout.weeksMeetingMinimum}
                        </span>
                        .{' '}
                      </>
                    ) : (
                      ' პუბლიკაცია. '
                    )}
                    {payout.activityCheckPassed
                      ? 'შემოწმება გავლილია.'
                      : 'შემოწმება ვერ გაიარა: გადაამოწმეთ, იღებდნენ თუ არა გამომწერები კონტენტს მთელი თვის განმავლობაში.'}
                  </div>

                  <DecidePayoutForm
                    payoutId={payout.id}
                    iban={revealPayoutIban(payout.accountCipher)}
                    holderName={holderName(payout.analystProfile)}
                    maskedAccount={payout.maskedAccount}
                    amountLabel={formatMoney(payout.amountMinor, payout.currency)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader title="ისტორია" description="ბოლო გადაწყვეტილებები." />
          <CardBody>
            {rest.length === 0 ? (
              <EmptyState title="ისტორია ცარიელია" />
            ) : (
              <ul className="divide-y divide-line">
                {rest.map((payout) => (
                  <li
                    key={payout.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-ink">
                        {payout.analystProfile.displayName}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        {payout.maskedAccount} ·{' '}
                        {payout.decidedAt
                          ? formatDateTimeKa(payout.decidedAt)
                          : formatDateTimeKa(payout.requestedAt)}
                      </p>
                      {payout.failureReason ? (
                        <p className="mt-0.5 text-sm text-loss">
                          {payout.failureReason}
                        </p>
                      ) : null}
                      {payout.failureDetail ? (
                        <p className="mt-0.5 text-xs break-words text-ink-faint">
                          {payout.failureDetail}
                        </p>
                      ) : null}
                      {payout.paymentReference ? (
                        <p className="mt-0.5 text-xs text-ink-faint">
                          ბანკის რეფერენსი:{' '}
                          <span className="tabular">{payout.paymentReference}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-ink">
                        {formatMoney(payout.amountMinor, payout.currency)}
                      </span>
                      <Badge
                        tone={
                          payout.status === 'PAID'
                            ? 'accent'
                            : payout.status === 'REJECTED' ||
                                payout.status === 'FAILED'
                              ? 'loss'
                              : 'pending'
                        }
                      >
                        {PAYOUT_STATUS_KA[payout.status]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader
            title="გატანის ფანჯარა"
            description={
              calendarOpen
                ? 'დღეს თვის ბოლო დღეა: გრაფიკზე მყოფ ყველა ავტორს გატანა უკვე შეუძლია.'
                : `გრაფიკით გატანა იხსნება ${formatDateKa(nextWithdrawalWindow(now))}. აქ შეგიძლიათ ცალკეულ ავტორს ადრე გაუხსნათ ან შეუჩეროთ.`
            }
          />
          <CardBody>
            {analysts.length === 0 ? (
              <EmptyState title="დამოწმებული ავტორი არ არის" />
            ) : (
              <ul className="divide-y divide-line">
                {analysts.map((analyst) => {
                  const open = isWithdrawalWindowOpen(now, analyst.payoutWindow);
                  return (
                    <li
                      key={analyst.id}
                      className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={analyst.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">
                            <Link
                              href={`/analysts/${analyst.slug}`}
                              className="hover:text-accent"
                            >
                              {analyst.displayName}
                            </Link>
                          </p>
                          <p className="text-sm text-ink-muted">
                            {analyst.user.email}
                          </p>
                          <p className="tabular mt-0.5 text-sm text-ink-faint">
                            ნაშთი:{' '}
                            {formatMoney(analyst.user.earningsMinor, 'GEL')}
                          </p>
                          {/* What the author sees right now, in one line, so
                              the switch below is judged against an outcome
                              rather than against the name of a setting. */}
                          <p className="mt-1 text-sm">
                            <span
                              className={open ? 'text-ink' : 'text-ink-muted'}
                            >
                              {open
                                ? 'ახლა გატანა შეუძლია.'
                                : 'ახლა გატანა არ შეუძლია.'}
                            </span>
                            {analyst.payoutWindow !== 'SCHEDULE' &&
                            analyst.payoutWindowNote ? (
                              <span className="text-ink-faint">
                                {' '}
                                {analyst.payoutWindowNote}
                                {analyst.payoutWindowSetAt
                                  ? ` · ${formatDateKa(analyst.payoutWindowSetAt)}`
                                  : ''}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      <div className="w-full sm:w-72">
                        <PayoutWindowForm
                          analystProfileId={analyst.id}
                          current={analyst.payoutWindow}
                          note={analyst.payoutWindowNote}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="info" title="IBAN როგორ ინახება">
          ავტორის შეყვანილი ანგარიში მოთხოვნას დაშიფრული (AES-256-GCM) ახლავს
          მხოლოდ განხილვის დასრულებამდე, და სრულად ჩანს მხოლოდ ამ გვერდზე,
          გადარიცხვისთვის. გადახდილად მონიშნვისას ან უარყოფისას იშლება;
          სამუდამოდ რჩება მხოლოდ დაფარული სახე.
        </Alert>
      </div>
    </div>
  );
}

/** Who the bank transfer is addressed to: the legal name when the author gave one. */
function holderName(profile: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const legal = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return legal || profile.displayName;
}
