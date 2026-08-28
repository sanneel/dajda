import { listAnalysts, type AnalystSort } from '@/lib/queries/analysts';
import { errorResponse, jsonResponse } from '@/lib/errors';
import { formatPercentBps, formatUnits } from '@/lib/format';

/** Public analyst leaderboard. Sample size travels with every rate. */
export const dynamic = 'force-dynamic';

const SORTS: AnalystSort[] = ['score', 'profit', 'volume', 'recent'];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sortParam = url.searchParams.get('sort');
    const sort: AnalystSort = SORTS.includes(sortParam as AnalystSort)
      ? (sortParam as AnalystSort)
      : 'score';

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
          total: analyst.allTime.total,
          won: analyst.allTime.won,
          lost: analyst.allTime.lost,
          pending: analyst.allTime.pending,
          decided: analyst.allTime.decided,
        },
        hitRate:
          analyst.allTime.decided === 0
            ? null
            : formatPercentBps(analyst.allTime.hitRateBps),
        units: formatUnits(analyst.allTime.profitUnitsCenti),
        currentStreak: analyst.allTime.currentStreak,
        // Consumers must be able to see that a rate is thin before quoting it.
        lowSample: analyst.lowSample,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
