import { BarChart3, ShieldCheck, Users } from 'lucide-react';
import { topAnalysts } from '@/lib/queries/analysts';
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
  const analysts = await topAnalysts(3);

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

      <ResponsibleUseNotice />
    </>
  );
}
