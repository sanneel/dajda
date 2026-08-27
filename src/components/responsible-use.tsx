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
        DAJDA არ არის ბუკმეკერი და ფსონს არ იღებს. პლატფორმა 18 წელს
        მიღწეულთათვისაა.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="responsible-use-heading"
      className="border-t border-line bg-canvas"
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

          <p className="mt-2.5 text-sm font-semibold leading-relaxed text-ink">
            DAJDA არ არის ბუკმეკერი.
          </p>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
            აქ იყიდება მხოლოდ ანალიტიკური კონტენტი: პლატფორმა ფსონს არ იღებს
            და მოგებას არ გპირდებათ. ყველა მაჩვენებელი წარსულ შედეგებს ასახავს
            და მომავლის გარანტია არ არის. პლატფორმა განკუთვნილია მხოლოდ 18
            წელს მიღწეულთათვის. თუ თამაში პრობლემად იქცა, დახმარების გზები
            აღწერილია პასუხისმგებლიანი გამოყენების გვერდზე.
          </p>

          {/* 18+ is stated visually above; repeated here for assistive tech. */}
          <p className="sr-only">პლატფორმა 18 წელს მიღწეულთათვისაა.</p>
        </div>
      </div>
    </section>
  );
}
