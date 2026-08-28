import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * robots.txt.
 *
 * The disallow list is every route that is either private or worthless in an
 * index: the signed-in areas, the auth forms, the API and the upload proxy.
 * Each of those already refuses or noindexes on its own; this only stops
 * crawlers spending their budget discovering that.
 *
 * The host comes from APP_URL rather than a constant so a staging deployment
 * does not publish a sitemap pointing at the production domain.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = getEnv().APP_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/analyst',
        '/dashboard',
        '/apply',
        '/api/',
        '/dev/',
        '/uploads/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
        '/auth/',
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
