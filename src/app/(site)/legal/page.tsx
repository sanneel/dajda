import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY } from '@/lib/company';
import {
  PRIVACY,
  RESPONSIBLE_USE,
  TERMS,
  type LegalSection,
} from '@/lib/legal/generated';

export const metadata: Metadata = {
  title: 'იურიდიული ინფორმაცია',
  description:
    'DAJDA-ს წესები და პირობები, კონფიდენციალურობის პოლიტიკა, დაბრუნების პოლიტიკა და პასუხისმგებლიანი გამოყენება.',
};

/*
 * All the legal documents on one page, rendered from the same generated
 * module that the exported PDFs come from (docs/legal/*.md via
 * `npm run legal:sync`). There is deliberately no prose written here: a
 * second copy of the terms with its own numbering is how the site and the
 * signed document end up disagreeing.
 *
 * #refunds is not a separate document. It renders the two chapters of the
 * terms that answer cancellation and refunds, verbatim and with their
 * original numbering, because a person following a "refund policy" footer
 * link is looking for exactly those clauses - and a paraphrase of them would
 * be a second version.
 */

const REFUND_SECTION_PREFIXES = ['11.', '12.'];

const refundSections = TERMS.sections.filter((section) =>
  REFUND_SECTION_PREFIXES.some((prefix) => section.title.startsWith(prefix)),
);

const BLOCKS: {
  id: string;
  title: string;
  updated: string;
  note?: string;
  sections: LegalSection[];
}[] = [
  {
    id: 'terms',
    title: TERMS.title,
    updated: TERMS.updated,
    sections: TERMS.sections,
  },
  {
    id: 'refunds',
    title: 'დაბრუნების პოლიტიკა',
    updated: TERMS.updated,
    note: 'ეს არის წესებისა და პირობების მე-11 და მე-12 თავები, უცვლელი ნუმერაციით.',
    sections: refundSections,
  },
  {
    id: 'privacy',
    title: PRIVACY.title,
    updated: PRIVACY.updated,
    sections: PRIVACY.sections,
  },
  {
    id: 'responsible-use',
    title: RESPONSIBLE_USE.title,
    updated: RESPONSIBLE_USE.updated,
    sections: RESPONSIBLE_USE.sections,
  },
];

function SectionBody({ section }: { section: LegalSection }) {
  return (
    <div className="pt-5">
      <h3 className="text-base font-semibold text-ink">{section.title}</h3>
      <div className="mt-2 space-y-2.5">
        {section.paragraphs.map((paragraph) => (
          <p
            key={paragraph}
            className="whitespace-pre-line text-sm leading-relaxed text-ink-muted"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl text-ink sm:text-4xl">
        იურიდიული ინფორმაცია
      </h1>

      {/*
       * Who the documents bind, stated once above them. Not a paraphrase of
       * any clause: these are the requisites from company.json that the
       * terms themselves are generated from, put where a reader (or the
       * payment provider) looks for them first.
       */}
      <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-faint">მომსახურების გამწევი</dt>
        <dd className="text-ink">
          {`${COMPANY.nameKa}, სავაჭრო სახელწოდება „${COMPANY.tradeNameKa}"`}
        </dd>
        <dt className="text-ink-faint">საიდენტიფიკაციო კოდი</dt>
        <dd className="tabular text-ink">{COMPANY.legalId}</dd>
        <dt className="text-ink-faint">მისამართი</dt>
        <dd className="text-ink">{COMPANY.addressKa}</dd>
        <dt className="text-ink-faint">კონტაქტი</dt>
        <dd className="text-ink">
          <a href={`mailto:${COMPANY.supportEmail}`} className="text-accent hover:underline">
            {COMPANY.supportEmail}
          </a>
          {" · "}
          <span className="tabular">{COMPANY.phone}</span>
        </dd>
        <dt className="text-ink-faint">მიწოდება და დაბრუნება</dt>
        <dd className="text-ink-muted">
          ციფრული კონტენტი, წვდომა იხსნება გადახდის დადასტურებისთანავე (წესები 9.7);
          დაბრუნება მე-12 თავის მიხედვით.
        </dd>
      </dl>

      {/* Jump list, so a footer link can land on the right document. */}
      <nav aria-label="დოკუმენტები" className="mt-8 border-y border-line py-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {BLOCKS.map((block) => (
            <li key={block.id}>
              <a
                href={`#${block.id}`}
                className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {block.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {BLOCKS.map((block) => (
        <section
          key={block.id}
          id={block.id}
          aria-labelledby={`${block.id}-heading`}
          className="scroll-mt-24 pt-12"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={`${block.id}-heading`}
              className="font-display text-2xl text-ink"
            >
              {block.title}
            </h2>
            <p className="text-xs text-ink-faint">
              ბოლო განახლება: {block.updated}
            </p>
          </div>

          {block.note ? (
            <p className="mt-2 text-sm text-ink-faint">
              {block.note}{' '}
              <Link href="#terms" className="text-accent hover:underline">
                სრული ტექსტი
              </Link>
            </p>
          ) : null}

          <div className="mt-3 divide-y divide-line border-t border-line">
            {block.sections.map((section) => (
              <SectionBody key={section.title} section={section} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
