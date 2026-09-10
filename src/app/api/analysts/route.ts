import { listAnalysts, type AnalystSort } from '@/lib/queries/analysts';
import { errorResponse, jsonResponse } from '@/lib/errors';
import { formatPercentBps, formatUnits } from '@/lib/format';

/**
 * Public analyst leaderboard. Sample size travels with every rate.
 *
 * Subscription tickets only, like the page it mirrors: an author with none
 * is not listed, and `record` counts nothing else. Stated here because an API
 * consumer cannot see the page to find out.
 */
export const dynamic = 'force-dynamic';

const SORTS: AnalystSort[] = ['profit', 'accuracy', 'odds-high', 'volume'];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sortParam = url.searchParams.get('sort');
    const sort: AnalystSort = SORTS.includes(sortParam as AnalystSort)
      ? (sortParam as AnalystSort)
      : 'profit';

    const analysts = await listAnalysts({
      sort,
      sportCode: url.searchParams.get('sport') ?? undefined,
    });

    return jsonResponse({
      sort,
      items: analysts.map((analyst) => ({
        slug: analyst.slug,
        displayName: analyst.displayName,
        sports: analyst.sports.map((sport) => sport.code),
        isDemo: analyst.isDemo,
        record: {
          total: analyst.stats.total,
          won: analyst.stats.won,
          lost: analyst.stats.lost,
          pending: analyst.stats.pending,
          decided: analyst.stats.decided,
        },
        hitRate:
          analyst.stats.decided === 0
            ? null
            : formatPercentBps(analyst.stats.hitRateBps),
        units: formatUnits(analyst.stats.profitUnitsCenti),
        currentStreak: analyst.stats.currentStreak,
        // Consumers must be able to see that a rate is thin before quoting it.
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
