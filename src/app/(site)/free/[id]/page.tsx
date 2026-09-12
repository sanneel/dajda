import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Check, Lock } from 'lucide-react';
import {
  activePlanGrants,
  getTicketById,
  purchasedTicketIds,
} from '@/lib/queries/tickets';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { prisma } from '@/lib/db';
import {
  formatDateTimeKa,
  formatMoney,
  formatOdds,
  formatUnitsSigned,
} from '@/lib/format';
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

  /*
   * A ticket's title IS the pick, and metadata is viewer-independent: it goes
   * to link previews, crawlers and the browser tab, where no session exists
   * to check. So it carries the real title only where the pick is public to
   * everyone - a settled free ticket - and is masked otherwise.
   *
   * A paid ticket is masked forever, settled included. Its buyer already has
   * the page; a link preview that names the pick would sell it to everyone
   * else for nothing.
   */
  const isPaid = ticket.visibility !== 'PUBLIC' && ticket.authorId !== null;

  if (isPaid || ticket.status === 'PENDING') {
    const kind = isPaid ? 'ფასიანი' : 'უფასო';
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
 * The screenshot fills the page because the screenshot is the claim: the
 * slip as the author photographed it, every photo of it in the order they
 * were picked. The author crops the bookmaker's branding and their balance
 * out before posting (the form says so, and the upload is screened for
 * logos), so the picture the buyer opens is the record and nothing else.
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
  const [grants, purchased] = await Promise.all([
    activePlanGrants(actor?.userId),
    purchasedTicketIds(actor?.userId),
  ]);

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
   * One decision for the whole page, taken by the one function that is
   * allowed to take it. A paid ticket opens for the person who paid the
   * right way and stays shut for everybody else, settled or not; a free one
   * costs an account while it is open and is public once it is settled.
   *
   * The analysis text rides on the same key rather than a second one. Two
   * gates over one product is how a reader ends up seeing the pick but not
   * the reasoning, or worse, the other way round.
   */
  const isPaid = ticket.visibility !== 'PUBLIC' && ticket.authorId !== null;
  const locked = isTicketLocked(
    {
      visibility: ticket.visibility,
      authorId: ticket.authorId,
      status: ticket.status,
    },
    actor ? { role: actor.role, analystProfileId: actor.analystProfileId } : null,
    grants,
    purchased.has(ticket.id),
  );
  const canView = !locked;

  /*
   * The result photo is the author's proof for the administrator, not part
   * of the public record: only those two see it.
   */
  const canSeeOriginal =
    actor !== null &&
    (actor.role === 'ADMIN' ||
      actor.userId === ticket.postedBy.id ||
      (author !== null && actor.analystProfileId === author.id));

  const screenshots = [ticket.screenshotPath, ...ticket.extraScreenshotPaths];

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
              ? ticket.visibility === 'PREMIUM'
                ? 'ეს ბილეთი იხსნება მხოლოდ შეძენით'
                : 'ეს ბილეთი იხსნება მხოლოდ ავტორის გამოწერით'
              : 'ეს პროგნოზი იხსნება შესვლის შემდეგ'}
          </p>

          <div className="grid w-full grid-cols-2 gap-4 py-1 sm:max-w-sm">
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
            {isPaid
              ? 'შედეგის დათვლის შემდეგ საჯარო ხდება კოეფიციენტი, თარიღი და შედეგი. ბილეთის შიგთავსს მხოლოდ მყიდველი ხედავს.'
              : 'შედეგის დათვლის შემდეგ პროგნოზი ავტომატურად ხდება საჯარო ჩანაწერის ნაწილი.'}
          </p>

          {isPaid && author ? (
            <div className="flex flex-wrap items-center gap-3">
              {/*
               * One way in from here: the single ticket. The subscription
               * is bought on the author's page, and the author card below
               * leads there; a second button on this panel promised a
               * purchase this page cannot complete.
               */}
              {actor && ticket.priceMinor !== null && ticket.priceMinor > 0 ? (
                <BuyTicketButton
                  predictionId={ticket.id}
                  priceMinor={ticket.priceMinor}
                />
              ) : null}
              {/*
               * A visitor who is not signed in still has to learn that the
               * single ticket exists: the feed said "ყიდვა", and a page that
               * then offered nothing read as a dead end.
               */}
              {!actor && ticket.priceMinor !== null && ticket.priceMinor > 0 ? (
                <ButtonLink href="/login">
                  {`შესვლა და ყიდვა · ${formatMoney(ticket.priceMinor)}`}
                </ButtonLink>
              ) : null}
              {ticket.priceMinor === null || ticket.priceMinor <= 0 ? (
                <ButtonLink href={`/analysts/${author.slug}`} variant="secondary">
                  ავტორის გვერდი
                </ButtonLink>
              ) : null}
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
        /*
         * The slip, as photographed. One frame per photo, each at the
         * picture's own height: a slip is taller than it is wide, and a
         * fixed box either cropped the last leg or left a bar of empty
         * ground under a short one.
         */
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <p className="text-sm text-ink-muted">
              ბილეთის სკრინშოტი
              {screenshots.length > 1 ? (
                <span className="tabular"> · {screenshots.length} ფოტო</span>
              ) : null}
              {ticket.eventAt ? (
                <>
                  {' · '}
                  <span className="tabular">{formatDateTimeKa(ticket.eventAt)}</span>
                </>
              ) : null}
            </p>
            <StatusBadge status={ticket.status} />
          </div>
          <ol className="divide-y divide-line bg-canvas">
            {screenshots.map((path, index) => (
              <li key={path} className="p-2 sm:p-3">
                {/*
                 * Unsized on purpose: the stored image's dimensions are not
                 * on the row, and `fill` needs a box. Width is the column;
                 * height follows the picture.
                 */}
                <Image
                  src={path}
                  alt={
                    screenshots.length > 1
                      ? `${ticket.titleKa}, ფოტო ${index + 1}`
                      : ticket.titleKa
                  }
                  width={1200}
                  height={1600}
                  sizes="(min-width: 768px) 42rem, 92vw"
                  className="mx-auto h-auto w-full max-w-xl rounded-md"
                  priority={index === 0}
                />
              </li>
            ))}
          </ol>
          {result ? (
            <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-sm text-ink-muted sm:px-5">
              <Check className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                შემოწმებულია ადმინისტრატორის მიერ,{' '}
                <span className="tabular">{formatDateTimeKa(result.settledAt)}</span>
              </span>
            </p>
          ) : null}
        </div>
      )}

      {/* The analysis. Behind the same key as the pick, because prose can
          restate a pick: a gate the reasoning could outlive would hand the
          bet away in sentences. While locked, the panel above already carries
          the gate and the way in, so nothing repeats here. */}
      {canView && ticket.descriptionKa ? (
        <p className="mt-5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
          {ticket.descriptionKa}
        </p>
      ) : null}

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

              {/* The author's proof carries the bookmaker's branding too, so
                  it stays with the author and the administrator. The public
                  sees the source named on the ticket above. */}
              {ticket.resultScreenshotPath && canSeeOriginal ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-xs text-ink-muted">
                    შედეგის სკრინშოტი, ავტორისგან. მხოლოდ თქვენ და ადმინი
                    ხედავთ.
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
            <Avatar name={author.displayName} src={author.photoPath} size="md" />
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
