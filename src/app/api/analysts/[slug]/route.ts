import { getAnalystBySlug } from '@/lib/queries/analysts';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { cumulativeUnits, monthlyPerformance } from '@/lib/stats/performance';
import { errorResponse, jsonResponse } from '@/lib/errors';
import { formatOdds, formatUnits } from '@/lib/format';

/**
 * Public analyst profile.
 *
 * The full published record is exposed - including losses - because a
 * verifiable history is the product. The written analysis is not included,
 * and an OPEN paid bet keeps its pick (title, slip) back too: this endpoint
 * is unauthenticated, so it answers as the signed-out viewer.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const data = await getAnalystBySlug(slug);

    if (!data) {
      return Response.json(
        {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'ანალიტიკოსი ვერ მოიძებნა.' },
        },
        { status: 404 },
      );
    }

    return jsonResponse({
      slug: data.profile.slug,
      displayName: data.profile.displayName,
      headline: data.profile.headline,
      bio: data.profile.bio,
      isDemo: data.profile.isDemo,
      sports: data.profile.sports.map((entry) => entry.sport.code),
      allTime: data.allTime,
      last30Days: data.last30Days,
      cumulativeUnits: cumulativeUnits(data.records).map((point) => ({
        index: point.index,
        date: point.date,
        units: formatUnits(point.cumulativeUnitsCenti),
      })),
      monthly: monthlyPerformance(data.records).map((bucket) => ({
        month: bucket.month,
        won: bucket.won,
        lost: bucket.lost,
        units: formatUnits(bucket.profitUnitsCenti),
      })),
      predictions: data.predictions.map((prediction) => {
        const locked = isTicketLocked(
          {
            visibility: prediction.visibility,
            authorId: data.profile.id,
            status: prediction.status,
          },
          null,
          [],
        );

        return {
          id: prediction.id,
          title: locked ? null : prediction.titleKa,
          sport: prediction.sport.code,
          screenshot: locked ? null : prediction.screenshotPath,
          locked,
          oddsAtPublication: formatOdds(prediction.oddsMilli),
          firstLegAt: prediction.eventAt,
          publishedAt: prediction.publishedAt,
          status: prediction.status,
          units: prediction.result
            ? formatUnits(prediction.result.profitUnitsCenti)
            : null,
        };
      }),
      plans: data.profile.plans.map((plan) => ({
        id: plan.id,
        tier: plan.tier,
        name: plan.nameKa,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
