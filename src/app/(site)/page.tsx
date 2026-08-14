import Link from 'next/link';
import { BarChart3, Radio, ShieldCheck, Users } from 'lucide-react';
import { topAnalysts } from '@/lib/queries/analysts';
import { runningLiveSessions } from '@/lib/queries/feed';
import { formatDateTimeKa } from '@/lib/format';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { Hero } from './hero';

// Live results and a session-dependent header: never statically cached.
export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: BarChart3,
    title: 'დეტალური ანალიტიკა',
    body: '[ერთი წინადადება: რომელი ციფრები ჩანს ყველა ანალიტიკოსზე]',
  },
  {
    icon: Users,
    title: 'საუკეთესო ანალიტიკოსები',
    body: '[ერთი წინადადება: როგორ ლაგდებიან და რატომ ამ თანმიმდევრობით]',
  },
  {
    icon: ShieldCheck,
    title: 'დაბლოკილი ჩანაწერი',
    body: '[ერთი წინადადება: რა იბლოკება გამოქვეყნების შემდეგ]',
  },
];

export default async function HomePage() {
  const [analysts, liveSessions] = await Promise.all([
    topAnalysts(3),
    runningLiveSessions(4),
  ]);

  return (
    <>
      <Hero analysts={analysts} />

      {/* ---------------------------------------------------------------- */}
      {/* Three claims, on white, divided by rules rather than boxed as     */}
      {/* cards: they are one row of statements, not three products.        */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-surface" aria-labelledby="features-heading">
        <h2 id="features-heading" className="sr-only">
          რას გთავაზობთ DAJDA
        </h2>
        <div className="mx-auto grid max-w-page gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-3 lg:gap-x-10 lg:divide-x lg:divide-line">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex gap-4 lg:px-8 lg:first:pl-0 lg:last:pr-0"
            >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-control bg-elevated text-ink"
                aria-hidden="true"
              >
                <feature.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base text-ink">
                  {feature.title}
                </h3>
                <p className="ph mt-1.5 text-sm leading-relaxed">
                  {feature.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Live right now.                                                   */}
      {/*                                                                   */}
      {/* This replaced a numbered "how it works" strip. That strip said in */}
      {/* three steps what the page already says, and three numbered steps  */}
      {/* under a feature row is the shape every templated landing page has. */}
      {/* This block only exists when something is actually happening, and  */}
      {/* it is the one thing on the page that changes hour to hour.        */}
      {/* ---------------------------------------------------------------- */}
      {liveSessions.length > 0 ? (
        <section
          className="bg-surface"
          aria-labelledby="live-heading"
        >
          <div className="mx-auto max-w-page px-4 py-12 sm:px-8">
            <h2
              id="live-heading"
              className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink"
            >
              <Radio className="size-5 text-signal" aria-hidden="true" />
              ახლა ლაივზე
            </h2>

            <ul className="mt-5 border-t border-line">
              {liveSessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {session.liveLabelKa}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      <Link
                        href={`/analysts/${session.author.slug}`}
                        className="hover:text-accent"
                      >
                        {session.author.displayName}
                      </Link>
                      {session.liveAt ? (
                        <>
                          {' · '}
                          <span className="tabular">
                            {formatDateTimeKa(session.liveAt)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <p className="tabular shrink-0 text-sm text-ink-faint">
                    {session._count.updates} პოსტი
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-page px-4 sm:px-8">
        {/* A plain div: ResponsibleUseNotice is itself a labelled <section>. */}
        <div className="pb-16">
          <ResponsibleUseNotice />
        </div>
      </div>
    </>
  );
}
