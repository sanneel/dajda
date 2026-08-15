import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPercentBpsSigned, formatUnitsSigned } from "@/lib/format";
import type { AnalystListItem } from "@/lib/queries/analysts";
import { Avatar } from "@/components/ui/avatar";

/**
 * Home hero: a copy column beside a live panel.
 *
 * The panel is the argument. Rather than describing the record in prose, it
 * shows three real analysts with their real ROI, so the first thing on the
 * page is the thing being sold. The reference comp put a line chart under
 * this list; it is deliberately not here, because a sparkline of a rolling
 * average is the one figure on this page nobody can audit.
 *
 * The figures are read from the database, never typed in. The comp showed
 * round marketing numbers; this product's whole claim is that its record is
 * verifiable, so a hero that overstates the scale would undercut it.
 */
export function Hero({ analysts }: { analysts: AnalystListItem[] }) {
  return (
    <section className="border-b border-line bg-canvas">
      <div className="mx-auto grid max-w-page items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
        {/* ----------------------------------------------------------- */}
        {/* Copy column                                                   */}
        {/* ----------------------------------------------------------- */}
        <div>
          {/*
           * Leading is set here, not left to the type scale: Tailwind's
           * text-5xl ships line-height 1, which clips Mkhedruli descenders.
           */}
          <h1 className="font-display-xl text-[2.25rem] leading-[1.14] text-ink sm:text-5xl sm:leading-[1.14]">
            ნახე ვინ დადო
            <br />
            <span className="text-accent">სწორად.</span>
          </h1>

          <p className="ph mt-6 max-w-lg text-base leading-relaxed sm:text-lg">
            [ორი ხაზი: რას აკეთებს DAJDA და რატომ ენდობა მომხმარებელი ციფრებს]
          </p>

          <div className="mt-8">
            <Link
              href="/analysts"
              className="group inline-flex min-h-[3.25rem] items-center justify-center gap-3 rounded-control bg-ink px-7 text-[0.9375rem] font-bold text-on-ink transition-colors hover:bg-accent"
            >
              ანალიტიკოსების ნახვა
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* ----------------------------------------------------------- */}
        {/* Live panel                                                    */}
        {/* ----------------------------------------------------------- */}
        <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-panel">
          {/*
           * The panel's header is a filled navy bar, not a hairline rule. It
           * gives the one live element on the page a hard top edge, which is
           * what makes it read as a panel rather than as more page.
           */}
          <div className="flex items-center justify-between gap-4 bg-band px-5 py-4">
            <h2 className="font-display text-base text-on-band">
              საუკეთესო ანალიტიკოსები
            </h2>
            <Link
              href="/analysts"
              className="group inline-flex items-center gap-1.5 text-sm text-on-band/75 transition-colors hover:text-on-band"
            >
              ყველას ნახვა
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          {analysts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-faint">
              ანალიტიკოსი ჯერ არ არის.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {analysts.map((analyst) => {
                const settled = analyst.allTime.decided > 0;
                return (
                  <li
                    key={analyst.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={analyst.displayName} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {analyst.displayName}
                        </p>
                        <p className="truncate text-sm text-ink-faint">
                          {analyst.sports
                            .map((sport) => sport.nameKa)
                            .join(", ")}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <p className="text-xs text-ink-faint">ROI</p>
                      <p className="tabular font-bold text-ink">
                        {settled
                          ? formatPercentBpsSigned(analyst.allTime.roiBps)
                          : "·"}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <p className="text-xs text-ink-faint">ერთეულები</p>
                      <p
                        className={`tabular font-bold ${
                          analyst.allTime.profitUnitsCenti < 0
                            ? "text-loss"
                            : "text-win"
                        }`}
                      >
                        {settled
                          ? formatUnitsSigned(analyst.allTime.profitUnitsCenti)
                          : "·"}
                      </p>
                    </div>

                    <Link
                      href={`/analysts/${analyst.slug}`}
                      className="shrink-0 rounded-control border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
                    >
                      გადახედე
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
