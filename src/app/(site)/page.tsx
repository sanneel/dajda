import Link from 'next/link';
import { Users } from 'lucide-react';
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

  const [analysts, sports, actor] = await Promise.all([
    listAnalysts({ sort, period, sportCode: sportParam, query: queryParam }),
    listSports(),
    getCurrentUser(),
  ]);

  const selectClass =
    'min-h-11 w-full rounded-control border border-on-band/25 bg-on-band/10 px-3 text-sm text-on-band ' +
    // The options themselves render in the OS palette, so they need an
    // explicit light ground or they inherit white-on-white in some browsers.
    '[&>option]:bg-surface [&>option]:text-ink';

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-5xl">
          ნახე, ვისი ანალიზი
          <br />
          <span className="text-accent">მართლდება.</span>
        </h1>

        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
          ავტორები პროგნოზს მოვლენის დაწყებამდე აქვეყნებენ, შედეგი უცვლელად ფიქსირდება
          და სტატისტიკა შემოწმებადია, წაგებული პროგნოზების ჩათვლით.
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

      <div className="mb-6 border-t border-line pt-7">
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
        <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
          <AnalystSearch initialQuery={queryParam ?? ''} />

          <div className="min-w-0 flex-1 basis-[7.5rem]">
            <label
              htmlFor="filter-sort"
              className="rule-label mb-1.5 block text-on-band/75"
            >
              დალაგება
            </label>
            <select
              id="filter-sort"
              name="sort"
              defaultValue={sort}
              className={selectClass}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1 basis-[7.5rem]">
            <label
              htmlFor="filter-period"
              className="rule-label mb-1.5 block text-on-band/75"
            >
              პერიოდი
            </label>
            <select
              id="filter-period"
              name="period"
              defaultValue={period}
              className={selectClass}
            >
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1 basis-[7.5rem]">
            <label
              htmlFor="filter-sport"
              className="rule-label mb-1.5 block text-on-band/75"
            >
              სპორტი
            </label>
            <select
              id="filter-sport"
              name="sport"
              defaultValue={sportParam ?? ''}
              className={selectClass}
            >
              <option value="">ყველა სპორტი</option>
              {sports.map((sport) => (
                <option key={sport.code} value={sport.code}>
                  {sport.nameKa}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-control bg-on-band px-5 text-sm font-semibold text-band transition-colors hover:opacity-90"
          >
            ჩვენება
          </button>
        </div>
      </form>

      {analysts.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" aria-hidden="true" />}
          title="ანალიტიკოსი ვერ მოიძებნა"
          description="სცადეთ სხვა ძებნა ან წაშალეთ ფილტრი."
        />
      ) : (
        <AnalystList analysts={analysts} />
      )}

      <div className="mt-12">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
