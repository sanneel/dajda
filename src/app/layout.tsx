import type { Metadata, Viewport } from 'next';
import { Google_Sans } from 'next/font/google';
import './globals.css';
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
    default: 'DAJDA · ნახე ვინ დადო სწორად.',
    template: '%s · DAJDA',
  },
  // Search-result copy. Under ~155 characters or Google truncates it.
  description:
    '[საიტის აღწერა საძიებო სისტემისთვის: 1 წინადადება, 155 სიმბოლომდე]',
  applicationName: 'DAJDA',
  openGraph: {
    type: 'website',
    locale: 'ka_GE',
    siteName: 'DAJDA',
    title: 'DAJDA · ნახე ვინ დადო სწორად.',
    description: '[სოციალურ ქსელში გაზიარების აღწერა: 1 მოკლე წინადადება]',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Both grounds are declared so the browser chrome follows the chosen theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1017' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
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
