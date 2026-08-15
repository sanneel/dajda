/**
 * Responsible-use notice.
 *
 * Sober and factual on purpose: past results are described as a record, never
 * as an expectation, and no wording implies guaranteed or risk-free returns.
 *
 * Drawn as a full-width band rather than a bordered card. It used to be one
 * more rounded box inset inside whatever container it happened to land in,
 * which made the legally load-bearing notice on the page look like a footnote
 * someone had boxed off. A band that runs edge to edge reads as part of the
 * page rather than as an aside, and it removes a border in a layout that had
 * far too many.
 *
 * The age mark is set as a typographic block rather than an icon. It is the
 * legally load-bearing part of this notice and should read as a stamp on a
 * document, not as decoration next to a paragraph.
 */
export function ResponsibleUseNotice({
  variant = 'full',
}: {
  variant?: 'full' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <p className="ph text-xs leading-relaxed">
        [ერთსტრიქონიანი ვერსია: DAJDA არ არის ბუკმეკერი + 18+]
      </p>
    );
  }

  return (
    <section
      aria-labelledby="responsible-use-heading"
      className="border-t border-line bg-elevated"
    >
      <div className="mx-auto grid max-w-page gap-4 px-4 py-8 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-6 sm:px-8">
        <p
          className="tabular self-start border border-line-strong px-2.5 py-1 text-center text-sm text-ink-muted"
          aria-hidden="true"
        >
          18+
        </p>

        <div>
          <h2
            id="responsible-use-heading"
            className="font-display text-base text-ink"
          >
            პასუხისმგებლიანი გამოყენება
          </h2>

          {/*
           * This one sentence stays as real copy on purpose: it is the product
           * boundary, it is one line, and shipping the page without it is the
           * kind of omission that matters. Everything under it is placeholder.
           */}
          <p className="mt-2.5 text-sm font-semibold leading-relaxed text-ink">
            DAJDA არ არის ბუკმეკერი.
          </p>

          <p className="ph mt-3 max-w-3xl text-sm leading-relaxed">
            [2–3 მოკლე წინადადება: რას ყიდის პლატფორმა, რას არ აკეთებს
            (ფსონი / თანხის შენახვა / მოგების დაპირება), და 18+ გაფრთხილება]
          </p>

          {/* 18+ is stated visually above; repeated here for assistive tech. */}
          <p className="sr-only">პლატფორმა 18 წელს მიღწეულთათვისაა.</p>
        </div>
      </div>
    </section>
  );
}
