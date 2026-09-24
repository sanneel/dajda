import Link from 'next/link';
import { ChevronDown, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/authorization';
import { AnalystSearch } from '@/components/analyst-search';
import { ButtonLink } from '@/components/ui/button';
import {
  listAnalysts,
  type AnalystPeriod,
  type AnalystSort,
} from '@/lib/queries/analysts';
import { listSports } from '@/lib/queries/tickets';
import { AnalystList } from '@/components/analyst-list';
import { EmptyState } from '@/components/ui/feedback';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

// No metadata export: the root page carries the site-wide title and
// description defined in the root layout.

const SORTS: { value: AnalystSort; label: string }[] = [
  { value: 'profit', label: 'მოგება' },
  { value: 'accuracy', label: 'სიზუსტე' },
  { value: 'odds-high', label: 'საშუალო კუში' },
  { value: 'volume', label: 'ფსონების რაოდენობა' },
];

const PERIODS: { value: AnalystPeriod; label: string }[] = [
  { value: 'all', label: 'სულ' },
  { value: '30', label: 'ბოლო 30 დღე' },
  { value: '90', label: 'ბოლო 3 თვე' },
  { value: '180', label: 'ბოლო 6 თვე' },
];

/**
 * The home page: the analyst ranking itself.
 *
 * One thing per row: who they are, how they have done, and a way to subscribe.
 * The controls sit in a dark band above the list, per the reference, so the
 * page reads as "settings, then results" rather than as one undifferentiated
 * column of boxes.
 *
 * The ordering rule is enforced in `sortAnalysts`, where a short record cannot
 * outrank a long one whatever is selected here.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const sortParam = typeof raw.sort === 'string' ? raw.sort : 'profit';
  const sort = (
    SORTS.some((option) => option.value === sortParam) ? sortParam : 'profit'
  ) as AnalystSort;

  const periodParam = typeof raw.period === 'string' ? raw.period : 'all';
  const period = (
    PERIODS.some((option) => option.value === periodParam) ? periodParam : 'all'
  ) as AnalystPeriod;

  const sportParam = typeof raw.sport === 'string' ? raw.sport : undefined;
  const queryParam =
    typeof raw.q === 'string' && raw.q.trim() !== ''
      ? raw.q.trim()
      : undefined;

  const actorPromise = getCurrentUser();
  const [analysts, sports, actor, subscribedIds] = await Promise.all([
    listAnalysts({ sort, period, sportCode: sportParam, query: queryParam }),
    listSports(),
    actorPromise,
    // Authors the viewer already pays: their rows say so instead of selling.
    actorPromise.then(async (viewer) =>
      viewer
        ? (
            await prisma.userSubscription.findMany({
              where: { userId: viewer.userId, status: 'ACTIVE' },
              select: { plan: { select: { analystProfileId: true } } },
            })
          )
            .map((row) => row.plan.analystProfileId)
            .filter((id): id is string => id !== null)
        : [],
    ),
  ]);

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-5xl">
          სპორტული <span className="text-accent">ანალიტიკა</span>
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
          ანალიტიკოსები თავიანთ პროგნოზებს მატჩის დაწყებამდე აქვეყნებენ. შედეგი
          დაფიქსირების შემდეგ აღარ იცვლება, სტატისტიკა კი ღიაა და შემოწმებადი,
          წაგებული პროგნოზების ჩათვლით.
        </p>

        {/*
         * A visitor gets the one committed action; a member already has an
         * account, so the quiet explainer link is all that remains.
         */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {!actor ? (
            <ButtonLink href="/register">შექმენი ანგარიში</ButtonLink>
          ) : null}
          <Link
            href="/how-it-works"
            className="inline-block text-sm font-medium text-accent"
          >
            როგორ მუშაობს? →
          </Link>
        </div>
      </header>

      {/* Linked from the dashboard as /#rating, so the reader lands on the
          list rather than on the hero above it. */}
      <div id="rating" className="mb-6 mt-10 scroll-mt-24">
        <h2 className="font-display text-xl text-ink">ანალიტიკოსების რეიტინგი</h2>
        <p className="mt-1.5 max-w-xl text-sm text-ink-muted">
          სტატისტიკა ასახავს წარსულს და არ არის მომავლის გარანტია.
        </p>
      </div>

      {/*
       * A plain GET form, not a row of link chips. Labelled controls read
       * as one control bar and stay one tab stop each as the sport list grows;
       * it also works with JavaScript disabled.
       */}
      <form
        method="get"
        action="/"
        className="mb-5 rounded-panel bg-band p-3 sm:p-5"
        aria-label="ანალიტიკოსების ფილტრი"
      >
        {/*
         * One wrapping row, tight labels: on a phone this must cost two rows
         * at most, or the list the page exists for starts below the fold.
         * Search lives behind the icon until tapped (order-first when open).
         */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-3 sm:gap-x-3">
          <BandSelect
            name="sort"
            label="დალაგება"
            defaultValue={sort}
            options={SORTS}
          />
          <BandSelect
            name="period"
            label="პერიოდი"
            defaultValue={period}
            options={PERIODS}
          />
          <BandSelect
            name="sport"
            label="სპორტი"
            defaultValue={sportParam ?? ''}
            options={[
              { value: '', label: 'ყველა სპორტი' },
              ...sports.map((sport) => ({
                value: sport.code,
                label: sport.nameKa,
              })),
            ]}
          />

          {/*
           * Search and submit close the row, in the order they are reached
           * for: the optional tool, then the action. Both stay direct children
           * of this row, so an opened search can take a full-width row of its
           * own (order-first) instead of being boxed into a corner of one.
           */}
          <AnalystSearch initialQuery={queryParam ?? ''} />

          <button
            type="submit"
            className="min-h-10 shrink-0 rounded-control bg-on-band px-5 text-sm font-semibold text-band transition-opacity hover:opacity-90"
          >
            ჩვენება
          </button>
        </div>
      </form>

      {analysts.length === 0 ? (
        /*
         * Two different empties: a filter that matched nobody, and a site
         * with no authors yet. Telling the second reader to "clear the
         * filter" would send them looking for one that is not there.
         */
        period === 'all' && !sportParam && !queryParam ? (
          <EmptyState
            icon={<Users className="size-8" aria-hidden="true" />}
            title="ავტორები ჯერ არ არიან"
            description="ანალიტიკოსი აქ გამოჩნდება, როგორც კი პირველ გამოწერის ბილეთს გამოაქვეყნებს."
          />
        ) : (
          <EmptyState
            icon={<Users className="size-8" aria-hidden="true" />}
            title="ანალიტიკოსი ვერ მოიძებნა"
            description="სცადეთ სხვა ძებნა ან წაშალეთ ფილტრი."
          />
        )
      ) : (
        <AnalystList analysts={analysts} subscribedIds={subscribedIds} />
      )}

      <div className="mt-12">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}

/** One labelled select in the dark filter band. */
function BandSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${name}`;
  return (
    <div className="min-w-0 flex-1 basis-[7.5rem]">
      <label htmlFor={id} className="rule-label mb-1.5 block text-on-band/60">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          className={
            'min-h-10 w-full appearance-none rounded-control border border-on-band/20 bg-on-band/10 py-2 pl-3 pr-9 text-sm text-on-band ' +
            'transition-colors hover:border-on-band/35 focus:border-on-band/60 focus:outline-none ' +
            // The options themselves render in the OS palette, so they need an
            // explicit light ground or they inherit white-on-white in some browsers.
            '[&>option]:bg-surface [&>option]:text-ink'
          }
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-on-band/55"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
