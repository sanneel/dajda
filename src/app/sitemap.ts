import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** The public pages that exist whether or not anybody has published yet. */
const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/free', priority: 0.8 },
  { path: '/paid', priority: 0.7 },
  { path: '/how-it-works', priority: 0.6 },
  { path: '/legal', priority: 0.5 },
  { path: '/contact', priority: 0.5 },
];

/**
 * sitemap.xml.
 *
 * Only what a signed-out visitor can actually read: the fixed pages, the
 * approved analyst profiles and the published free predictions. Paid
 * predictions are deliberately absent - their pages exist, but their content
 * is behind a subscription, and listing them invites crawlers to index a wall.
 *
 * `lastModified` is a real timestamp from the row rather than the build time,
 * so a re-deploy does not tell every crawler that the whole site changed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = getEnv().APP_URL;

  const [analysts, freeTickets] = await Promise.all([
    prisma.analystProfile.findMany({
      where: { status: 'APPROVED' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    }),
    prisma.prediction.findMany({
      // The same filter the free feed uses: PUBLIC visibility, published, and
      // not replaced by a corrected version. A superseded row still resolves,
      // but the version that replaced it is the one worth indexing.
      where: {
        visibility: 'PUBLIC',
        publishedAt: { not: null },
        supersededAt: null,
      },
      select: { id: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    }),
  ]);

  return [
    ...STATIC_PATHS.map((entry) => ({
      url: `${appUrl}${entry.path}`,
      changeFrequency: 'daily' as const,
      priority: entry.priority,
    })),
    ...analysts.map((analyst) => ({
      url: `${appUrl}/analysts/${analyst.slug}`,
      lastModified: analyst.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...freeTickets.map((ticket) => ({
      url: `${appUrl}/free/${ticket.id}`,
      lastModified: ticket.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ];
}
