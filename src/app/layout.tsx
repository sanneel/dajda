import type { Metadata, Viewport } from 'next';
import { Google_Sans } from 'next/font/google';
import './globals.css';
import { ThemeApplier } from '@/components/theme-applier';
import { ThemeScript } from '@/components/theme-script';
import { DemoBanner } from '@/components/demo-banner';

/**
 * One face for the entire product.
 *
 * Google Sans is one of only three families on Google Fonts with real
 * Mkhedruli coverage, and the only one of those that is a modern UI face
 * rather than a document face. It replaced Noto Sans Georgian, whose Georgian
 * glyphs read as a fallback rather than as a typeface, and IBM Plex Mono,
 * which set every figure and made columns of numbers look like terminal
 * output.
 *
 * Figures are now set in this same family with `font-variant-numeric:
 * tabular-nums` (see `.tabular` in globals.css). That keeps digits on a fixed
 * pitch so a column of odds still lines up, without a second family and
 * without the mono face's squared-off numerals.
 *
 * next/font self-hosts it at build time; no request reaches Google at runtime.
 * The family tops out at 700, so display type gets its weight from size and
 * tracking rather than from a heavier cut that does not exist.
 */
const sans = Google_Sans({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans-ui',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dajda.ge'),
  title: {
    default: 'DAJDA · სპორტული ანალიტიკა შემოწმებადი ჩანაწერით',
    template: '%s · DAJDA',
  },
  // Search-result copy. Under ~155 characters or Google truncates it.
  description:
    'სპორტული ანალიტიკის პლატფორმა: ვერიფიცირებული ავტორები, მოვლენამდე გამოქვეყნებული პროგნოზები და უცვლელი, შემოწმებადი სტატისტიკა.',
  applicationName: 'DAJDA',
  /*
   * The card image itself is src/app/opengraph-image.png, which Next turns
   * into absolute og:image and twitter:image tags against metadataBase above.
   * Only the card TYPE has to be stated: without it a shared link renders as
   * a thumbnail beside the text rather than the full-width image.
   */
  openGraph: {
    type: 'website',
    locale: 'ka_GE',
    siteName: 'DAJDA',
    title: 'DAJDA · სპორტული ანალიტიკა შემოწმებადი ჩანაწერით',
    description: 'სპორტული ანალიტიკა შემოწმებადი ჩანაწერით.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DAJDA · სპორტული ანალიტიკა შემოწმებადი ჩანაწერით',
    description: 'სპორტული ანალიტიკა შემოწმებადი ჩანაწერით.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Dark is the product's default whatever the operating system prefers, so
  // the browser chrome ships dark too. The toggle rewrites this meta tag when
  // somebody chooses light, keeping the chrome and the page in one theme.
  themeColor: '#0a1017',
  colorScheme: 'dark light',
  width: 'device-width',
  // Lets the page extend under the iPhone home indicator, which is what makes
  // env(safe-area-inset-bottom) non-zero for the bottom tab bar.
  viewportFit: 'cover',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: ThemeScript stamps data-theme on <html> before
    // React hydrates, so the server and client markup differ here by design.
    <html lang="ka" className={sans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeApplier />
        <a
          href="#main"
          className="skip-link rounded-control bg-ink px-4 py-2 font-medium text-on-ink"
        >
          გადადი მთავარ შინაარსზე
        </a>
        {/*
         * Mounted at the root rather than in a page layout so that it also
         * covers /admin, the auth pages and the error boundaries. There is no
         * route where a demo deployment should look like a real one.
         */}
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
