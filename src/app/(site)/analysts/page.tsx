import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { listAnalysts, type AnalystSort } from '@/lib/queries/analysts';
import { listSports } from '@/lib/queries/tickets';
import { AnalystList } from '@/components/analyst-list';
import { EmptyState } from '@/components/ui/feedback';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ანალიტიკოსები',
  description: '[ანალიტიკოსების გვერდის აღწერა საძიებოსთვის]',
};

const SORTS: { value: AnalystSort; label: string }[] = [
  { value: 'score', label: 'DAJDA რეიტინგი' },
  { value: 'recent', label: 'ბოლო 30 დღე' },
  { value: 'profit', label: 'ერთეულები' },
  { value: 'volume', label: 'ფსონების რაოდენობა' },
];

/**
 * The analyst list.
 *
 * One thing per row: who they are, how they have done, and a way to subscribe.
 * The controls sit in a dark band above the list, per the reference, so the
 * page reads as "settings, then results" rather than as one undifferentiated
 * column of boxes.
 *
 * The ordering rule is enforced in `sortAnalysts`, where a short record cannot
 * outrank a long one whatever is selected here.
 */
export default async function AnalystsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const sortParam = typeof raw.sort === 'string' ? raw.sort : 'score';
  const sort = (
    SORTS.some((option) => option.value === sortParam) ? sortParam : 'score'
  ) as AnalystSort;

  const sportParam = typeof raw.sport === 'string' ? raw.sport : undefined;

  const [analysts, sports] = await Promise.all([
    listAnalysts({ sort, sportCode: sportParam }),
    listSports(),
  ]);

  const selectClass =
    'min-h-11 w-full rounded-control border border-on-band/25 bg-on-band/10 px-3 text-sm text-on-band ' +
    // The options themselves render in the OS palette, so they need an
    // explicit light ground or they inherit white-on-white in some browsers.
    '[&>option]:bg-surface [&>option]:text-ink';

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ანალიტიკოსები
        </h1>
        <p className="ph mt-2 max-w-2xl">
          [ერთი წინადადება: რას ხედავს მომხმარებელი ამ სიაში]
        </p>
      </header>

      {/*
       * A plain GET form, not a row of link chips. Two labelled selects read
       * as one control bar and stay one tab stop each as the sport list grows;
       * it also works with JavaScript disabled.
       */}
      <form
        method="get"
        action="/analysts"
        className="mb-5 rounded-panel bg-band p-4 sm:p-5"
        aria-label="ანალიტიკოსების ფილტრი"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label
              htmlFor="filter-sort"
              className="rule-label mb-2 block text-on-band/75"
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

          <div className="min-w-0">
            <label
              htmlFor="filter-sport"
              className="rule-label mb-2 block text-on-band/75"
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
            className="min-h-11 rounded-control bg-on-band px-6 text-sm font-semibold text-band transition-colors hover:opacity-90"
          >
            ჩვენება
          </button>
        </div>
      </form>

      {analysts.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" aria-hidden="true" />}
          title="ანალიტიკოსი ვერ მოიძებნა"
          description="სცადეთ სხვა სპორტი ან წაშალეთ ფილტრი."
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
