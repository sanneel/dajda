import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/authorization";
import { formatDateKa, formatDateTimeKa, formatMoney } from "@/lib/format";
import {
  BALANCE_KIND_KA,
  BILLING_PERIOD_KA,
  PAYMENT_STATUS_KA,
  SUBSCRIPTION_STATUS_KA,
} from "@/lib/labels";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { CancelSubscriptionButton } from "./cancel-button";
import { ResendVerificationButton } from "./resend-verification-button";
import { VerifyCodeForm } from "./verify-code-form";
import { TopUpForm } from "./top-up-form";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "პროფილი",
  robots: { index: false, follow: false },
};

/*
 * The whole account on one page.
 *
 * This used to be four routes - overview, subscriptions, saved analysts and
 * view history - reachable only through a sidebar that existed to navigate the
 * split. The overview was mostly counts that linked to the other three, so
 * every real answer cost two page loads. There is not enough on any of them to
 * justify a route, and a person checking their account wants to see it, not
 * browse it.
 *
 * Settings stays separate: it is a form you go to on purpose, and mixing
 * editable fields into a page you read would invite accidental edits.
 */
export default async function DashboardPage() {
  const actor = await requireUser();

  const [subscriptions, payments, pendingPayments, balance, balanceEntries] =
    await Promise.all([
    prisma.userSubscription.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: {
          select: {
            nameKa: true,
            priceMinor: true,
            currency: true,
            billingPeriod: true,
            analystProfile: { select: { displayName: true, slug: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        providerOrderId: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        maskedCard: true,
      },
    }),
    // Counted separately rather than derived from `payments` above, which is
    // capped at ten rows and would undercount a long history.
    prisma.payment.count({
      where: {
        userId: actor.userId,
        status: { in: ["CREATED", "PROCESSING"] },
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { balanceMinor: true },
    }),
    prisma.balanceTransaction.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        kind: true,
        amountMinor: true,
        currency: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      {/*
       * Identity, not a greeting. On a phone this page opens from the
       * "პროფილი" tab, and a display-size hello plus a sentence describing
       * the sections below it cost a whole screen before the first number.
       * A profile page's header is who you are; everything else is content.
       */}
      <header className="flex items-center gap-3">
        <Avatar name={actor.name} size="md" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg text-ink">
            {actor.name}
          </h1>
          <p className="truncate text-sm text-ink-muted">{actor.email}</p>
        </div>
      </header>

      {!actor.emailVerifiedAt ? (
        <Alert tone="info" title="ელფოსტა არ არის დადასტურებული">
          <div className="space-y-3">
            <p>
              წერილი გამოგზავნილია რეგისტრაციისას მითითებულ მისამართზე.
              დააჭირეთ წერილის ღილაკს, ან ჩაწერეთ წერილში მოცემული 6 ციფრიანი
              კოდი:
            </p>
            <VerifyCodeForm />
            <p className="text-sm">
              წერილი ვერ იპოვეთ? შეამოწმეთ სპამი, ან გამოითხოვეთ ახალი:
            </p>
            <ResendVerificationButton />
          </div>
        </Alert>
      ) : null}

      {pendingPayments > 0 ? (
        <Alert tone="warning" title="გადახდა მუშავდება">
          გვაქვს <span className="tabular">{pendingPayments}</span>{" "}
          დაუდასტურებელი გადახდა. გამოწერა გააქტიურდება მხოლოდ ბანკიდან
          სერვერული დადასტურების მიღების შემდეგ.
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Balance                                                           */}
      {/* ---------------------------------------------------------------- */}
      <Card as="section">
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm text-ink-muted">ბალანსი</h2>
              <p className="font-display text-3xl text-ink tabular">
                {formatMoney(balance.balanceMinor, "GEL")}
              </p>
            </div>
            {/*
             * The top-up form starts folded. Most visits to this page are a
             * glance at a number or a cancellation, and an always-open input
             * with its explanation made the first card the tallest thing on a
             * phone. Native details, so it costs no JavaScript.
             */}
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors marker:content-none hover:border-ink-faint">
                <span className="group-open:hidden">შევსება</span>
                <span className="hidden group-open:inline">დახურვა</span>
              </summary>
              <div className="mt-3 space-y-2">
                <TopUpForm />
                <p className="max-w-72 text-xs leading-relaxed text-ink-faint">
                  თუ ბალანსი გეგმის სრულ ფასს ფარავს, გამოწერა პირდაპირ
                  ბალანსიდან გადაიხდება, ბარათის გარეშე.
                </p>
              </div>
            </details>
          </div>

          {balanceEntries.length > 0 ? (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer list-none text-sm text-ink-muted marker:content-none hover:text-ink">
                ბოლო მოძრაობები ({balanceEntries.length})
              </summary>
              <ul className="mt-2 divide-y divide-line text-sm">
              {balanceEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 text-ink-muted">
                    {BALANCE_KIND_KA[entry.kind]}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-ink-faint">
                      {formatDateKa(entry.createdAt)}
                    </span>
                    <span
                      className={
                        entry.amountMinor > 0
                          ? "tabular text-ink"
                          : "tabular text-ink-muted"
                      }
                    >
                      {entry.amountMinor > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(entry.amountMinor), entry.currency)}
                    </span>
                  </span>
                </li>
              ))}
              </ul>
            </details>
          ) : null}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Subscriptions                                                     */}
      {/* ---------------------------------------------------------------- */}
      {/*
       * A disclosure, open by default. Someone arriving at their profile is
       * usually here to check or cancel a subscription, so it must not start
       * hidden; but once read it is a long block sitting above everything
       * else, and it should be possible to fold away.
       */}
      <details open className="rounded-card border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:content-none sm:px-5">
          <span className="font-display text-base text-ink">გამოწერები</span>
          <span className="tabular text-sm text-ink-faint">
            {subscriptions.length}
          </span>
        </summary>
        <div className="border-t border-line p-4 sm:p-5">
          {subscriptions.length === 0 ? (
            <EmptyState
              title="აქტიური გამოწერა არ გაქვთ"
              description="გამოწერა ყოველი ავტორის პროფილზეა: აირჩიეთ ავტორი და ნახეთ მისი გეგმები."
              action={
                <ButtonLink href="/">ანალიტიკოსების ნახვა</ButtonLink>
              }
            />
          ) : (
            /*
             * One box, not one per subscription. The negative margin pulls the
             * list out to the card's own edges so the rules run the full width
             * instead of floating inside the padding.
             */
            <ul className="-m-4 divide-y divide-line sm:-m-5">
              {subscriptions.map((subscription) => (
                <li key={subscription.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {subscription.plan.nameKa}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {subscription.plan.analystProfile ? (
                          <Link
                            href={`/analysts/${subscription.plan.analystProfile.slug}`}
                            className="hover:text-ink"
                          >
                            {subscription.plan.analystProfile.displayName}
                          </Link>
                        ) : (
                          "პლატფორმის გეგმა"
                        )}
                        {" · "}
                        <span className="tabular">
                          {formatMoney(
                            subscription.plan.priceMinor,
                            subscription.plan.currency,
                          )}
                        </span>{" "}
                        / {BILLING_PERIOD_KA[subscription.plan.billingPeriod]}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {subscription.cancelAtPeriodEnd ? (
                        <Badge tone="warn">გაუქმდება პერიოდის ბოლოს</Badge>
                      ) : null}
                      <Badge
                        tone={
                          subscription.status === "ACTIVE"
                            ? "accent"
                            : subscription.status === "PENDING"
                              ? "pending"
                              : "neutral"
                        }
                      >
                        {SUBSCRIPTION_STATUS_KA[subscription.status]}
                      </Badge>
                    </div>
                  </div>

                  {/*
                    * One date, not a grid of three. The question this row
                    * answers is "when does the next charge (or the access)
                    * end" - the start date is nostalgia and "cancellation:
                    * none" was a column saying nothing.
                    */}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-ink-muted">
                      {subscription.cancelAtPeriodEnd
                        ? "წვდომა მთავრდება: "
                        : "განახლდება: "}
                      <span className="tabular text-ink">
                        {subscription.currentPeriodEnd
                          ? formatDateKa(subscription.currentPeriodEnd)
                          : "·"}
                      </span>
                    </span>
                    {subscription.status === "ACTIVE" &&
                    !subscription.cancelAtPeriodEnd ? (
                      <CancelSubscriptionButton
                        subscriptionId={subscription.id}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {subscriptions.some(
            (subscription) =>
              subscription.status === "ACTIVE" &&
              !subscription.cancelAtPeriodEnd,
          ) ? (
            <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
              გაუქმების შემდეგ წვდომა რჩება გადახდილი პერიოდის ბოლომდე და
              თანხა ავტომატურად აღარ ჩამოიჭრება.
            </p>
          ) : null}
        </div>
      </details>

      {/* ---------------------------------------------------------------- */}
      {/* Payments                                                          */}
      {/* ---------------------------------------------------------------- */}
      {/*
       * Collapsed by default: history is the section people need rarely and
       * scroll past always. The count on the summary says whether opening
       * is worth it.
       */}
      <details className="rounded-card border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:content-none sm:px-5">
          <span className="font-display text-base text-ink">
            გადახდების ისტორია
          </span>
          <span className="tabular text-sm text-ink-faint">
            {payments.length}
          </span>
        </summary>
        <div className="border-t border-line p-4 sm:p-5">
          {payments.length === 0 ? (
            <EmptyState title="გადახდა ჯერ არ დაფიქსირებულა" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">გადახდების ისტორია</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      თარიღი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      ბარათი
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-medium text-ink-muted"
                    >
                      თანხა
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-medium text-ink-muted"
                    >
                      სტატუსი
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="tabular py-2.5 text-ink-muted">
                        {formatDateTimeKa(payment.createdAt)}
                      </td>
                      <td className="tabular py-2.5 text-ink-muted">
                        {payment.maskedCard ?? "·"}
                      </td>
                      <td className="tabular py-2.5 text-right text-ink">
                        {formatMoney(payment.amountMinor, payment.currency)}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge
                          tone={
                            payment.status === "SUCCEEDED"
                              ? "accent"
                              : payment.status === "FAILED" ||
                                  payment.status === "DISPUTED"
                                ? "loss"
                                : "neutral"
                          }
                        >
                          {PAYMENT_STATUS_KA[payment.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
