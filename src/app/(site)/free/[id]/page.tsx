import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getTicketById } from '@/lib/queries/tickets';
import { canViewPrediction, getCurrentUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import { formatDateTimeKa, formatOdds, formatUnitsSigned } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { ReportForm } from '@/components/report-form';
import { PaymentReturnBanner } from '@/components/payment-return';
import { paymentReturnStatus } from '@/lib/payments/return-status';
import { BuyTicketButton } from './buy-button';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await getTicketById(id);
  if (!ticket) return { title: 'პროგნოზი ვერ მოიძებნა' };

  // A live bet's title IS the pick, and every open pick now costs at least an
  // account. Metadata is viewer-independent (link previews, crawlers), so
  // while the bet is open the title is masked for everyone.
  if (ticket.status === 'PENDING') {
    const kind =
      ticket.visibility !== 'PUBLIC' && ticket.authorId !== null
        ? 'ფასიანი'
        : 'უფასო';
    return { title: `${kind} პროგნოზი · ${ticket.sport.nameKa}` };
  }

  return {
    title: ticket.titleKa,
    description: ticket.descriptionKa ?? undefined,
  };
}

/**
 * One ticket.
 *
 * The slip fills the page because the slip is the claim. Below it sit only the
 * facts needed to judge it: the odds, who posted it, and how it resolved.
 *
 * The page serves both shapes of bet. A community ticket has no author and is
 * always readable; an analyst's paid bet keeps its gate, so a direct link
 * cannot be used to walk past a subscription.
 */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const ticket = await getTicketById(id);

  if (!ticket) notFound();

  const actor = await getCurrentUser();
  // Coming back from the payment page: say what is happening to the money.
  const returnStatus = await paymentReturnStatus(
    (await searchParams).order,
    actor?.userId,
  );
  const canView = await canViewPrediction(actor, {
    id: ticket.id,
    visibility: ticket.visibility,
    authorId: ticket.authorId,
  });

  // Record the view for the dashboard's "recently viewed" list.
  if (actor) {
    await prisma.predictionView.upsert({
      where: {
        userId_predictionId: { userId: actor.userId, predictionId: id },
      },
      create: { userId: actor.userId, predictionId: id },
      update: { viewedAt: new Date() },
    });
  }

  const { author, result } = ticket;

  /*
   * The pick (title and slip) is closed while the bet is still open: to
   * everyone without the right subscription on a paid bet, and to signed-out
   * visitors on any bet, because free tickets cost an account. `canView`
   * already answers the subscription question; once settled, the pick is
   * public record and nothing here locks.
   */
  const isPaid = ticket.visibility !== 'PUBLIC' && ticket.authorId !== null;
  const locked = ticket.status === 'PENDING' && (!actor || !canView);

  const feedHref = isPaid ? '/paid' : '/free';
  const feedLabel = isPaid ? 'ფასიანი პროგნოზები' : 'უფასო პროგნოზები';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-5 text-sm text-ink-muted" aria-label="ნავიგაცია">
        <Link href={feedHref} className="hover:text-ink">
          {feedLabel}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{ticket.sport.nameKa}</span>
      </nav>

      {returnStatus ? (
        <div className="mb-5">
          <PaymentReturnBanner status={returnStatus} />
        </div>
      ) : null}

      {ticket.supersededAt ? (
        <div className="mb-5">
          <Alert tone="warning" title="ეს ვერსია შესწორებულია">
            ჩანაწერი დარჩა საჯაროდ, მაგრამ მოქმედია განახლებული ვერსია.{' '}
            {ticket.correctedBy ? (
              <Link href={`/free/${ticket.correctedBy.id}`} className="underline">
                ნახეთ v{ticket.correctedBy.version}
              </Link>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{ticket.sport.nameKa}</Badge>
          <StatusBadge status={ticket.status} />
          {author?.isDemo ? <DemoBadge /> : null}
        </div>

        <h1 className="font-display mt-3 text-3xl text-ink sm:text-4xl">
          {locked ? `დახურული პროგნოზი · ${ticket.sport.nameKa}` : ticket.titleKa}
        </h1>

        <p className="tabular mt-2 text-sm text-ink-muted">
          კოეფიციენტი {formatOdds(ticket.oddsMilli)}
          {ticket.publishedAt ? ` · ${formatDateTimeKa(ticket.publishedAt)}` : ''}
        </p>
      </header>

      {locked ? (
        /*
         * What a buyer decides on, and nothing that gives the pick away:
         * total odds, when the first leg starts, and where buying happens.
         */
        <div className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6">
          <Lock className="size-5 text-ink-faint" aria-hidden="true" />
          <p className="font-medium text-ink">
            {isPaid
              ? ticket.priceMinor !== null && ticket.priceMinor > 0
                ? 'ეს პროგნოზი იხსნება ერთჯერადი შეძენით ან გამოწერით'
                : 'ეს პროგნოზი იხსნება ავტორის გამოწერით'
              : 'ეს პროგნოზი იხსნება შესვლის შემდეგ'}
          </p>

          <div className="grid w-full grid-cols-2 gap-4 border-y border-line py-4 sm:max-w-sm">
            <div>
              <p className="text-xs text-ink-faint">კოეფიციენტი</p>
              <p className="tabular text-xl font-bold text-ink">
                {formatOdds(ticket.oddsMilli)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">პირველი პოზიცია იწყება</p>
              <p className="tabular text-sm font-medium leading-7 text-ink">
                {ticket.eventAt
                  ? formatDateTimeKa(ticket.eventAt)
                  : 'დაუზუსტებელია'}
              </p>
            </div>
          </div>

          <p className="text-sm text-ink-muted">
            შედეგის დათვლის შემდეგ პროგნოზი ავტომატურად ხდება საჯარო ჩანაწერის
            ნაწილი.
          </p>

          {isPaid && author ? (
            <div className="flex flex-wrap items-center gap-3">
              {/*
               * Two ways in, dearest-first is deliberately NOT the order:
               * the single ticket is the smaller commitment, so it leads.
               */}
              {actor && ticket.priceMinor !== null && ticket.priceMinor > 0 ? (
                <BuyTicketButton
                  predictionId={ticket.id}
                  priceMinor={ticket.priceMinor}
                />
              ) : null}
              <ButtonLink
                href={`/analysts/${author.slug}?tab=plans#plans-heading`}
                variant={
                  actor && ticket.priceMinor !== null && ticket.priceMinor > 0
                    ? 'secondary'
                    : 'primary'
                }
              >
                შეძენა გამოწერით
              </ButtonLink>
            </div>
          ) : !isPaid ? (
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/login">შესვლა</ButtonLink>
              <ButtonLink href="/register" variant="secondary">
                რეგისტრაცია
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : (
        /* The slip, exactly as posted. */
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-canvas">
          <Image
            src={ticket.screenshotPath}
            alt={`პროგნოზის სკრინშოტი: ${ticket.titleKa}`}
            fill
            sizes="(min-width: 768px) 42rem, 92vw"
            className="object-contain"
            priority
          />
        </div>
      )}

      {/* Description. Gated with the pick while the ticket is locked - prose
          can restate the pick, so it must never outlive the slip's gate. On a
          settled paid bet the pick opens but the analysis stays subscriber-only
          (`canView`). While locked, the panel above already carries the gate
          and the CTA, so nothing repeats here. */}
      {canView && !locked ? (
        ticket.descriptionKa ? (
          <p className="mt-5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
            {ticket.descriptionKa}
          </p>
        ) : null
      ) : locked ? null : (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-card border border-dashed border-line bg-surface p-5">
          <Lock className="size-5 text-ink-faint" aria-hidden="true" />
          <p className="font-medium text-ink">
            აღწერა ხელმისაწვდომია გამოწერით
          </p>
          {author ? (
            <ButtonLink href={`/analysts/${author.slug}?tab=plans`}>
              გეგმების ნახვა
            </ButtonLink>
          ) : null}
        </div>
      )}

      {/* Result, once an admin has recorded it. */}
      {result ? (
        <div className="mt-5">
          <Card>
            <CardHeader title="შედეგი" level={2} />
            <CardBody>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <div>
                  <p className="text-xs text-ink-muted">ერთეულები</p>
                  <p
                    className={`tabular mt-0.5 text-xl font-semibold ${
                      result.profitUnitsCenti > 0
                        ? 'text-win'
                        : result.profitUnitsCenti < 0
                          ? 'text-loss'
                          : 'text-ink'
                    }`}
                  >
                    {formatUnitsSigned(result.profitUnitsCenti)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">დათვლის დრო</p>
                  <p className="tabular mt-0.5 text-sm text-ink">
                    {formatDateTimeKa(result.settledAt)}
                  </p>
                </div>
              </div>

              {ticket.resultScreenshotPath ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-xs text-ink-muted">
                    შედეგის სკრინშოტი, ავტორისგან
                  </p>
                  <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-card border border-line bg-canvas">
                    <Image
                      src={ticket.resultScreenshotPath}
                      alt="შედეგის სკრინშოტი"
                      fill
                      sizes="(min-width: 768px) 28rem, 92vw"
                      className="object-contain"
                    />
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Who posted it. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-4">
        {author ? (
          <Link
            href={`/analysts/${author.slug}?tab=${isPaid ? 'paid' : 'free'}`}
            className="flex items-center gap-3"
          >
            <Avatar name={author.displayName} size="md" />
            <div>
              <p className="font-medium text-ink">{author.displayName}</p>
              <p className="text-sm text-ink-muted">
                ანალიტიკოსი · პროფილისა და ისტორიის ნახვა
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={ticket.postedBy.name} size="md" />
            <div>
              <p className="font-medium text-ink">{ticket.postedBy.name}</p>
              <p className="text-sm text-ink-muted">
                უფასო პროგნოზი. სტატისტიკაში არ ითვლება.
              </p>
            </div>
          </div>
        )}

        <ReportForm targetType="PREDICTION" targetId={ticket.id} />
      </div>

      <div className="mt-8">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
