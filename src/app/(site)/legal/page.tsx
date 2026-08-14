import type { Metadata } from 'next';
import { Alert } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'იურიდიული ინფორმაცია',
  description: '[იურიდიული გვერდის აღწერა საძიებოსთვის]',
};

/*
 * All four legal documents on one page.
 *
 * They were four routes with a sidebar to move between them. Nobody reads
 * these documents by browsing - they arrive from a footer link, find the one
 * clause they came for, and leave. One page with anchors does that in a single
 * load, and the four-item sidebar that existed only to navigate the split is
 * gone with it.
 *
 * The structure is kept because it is a real decision: it says what each
 * document has to cover. The prose is not, because binding text for a paid
 * subscription service is a lawyer's output, not a placeholder's.
 */
const DOCUMENTS = [
  {
    id: 'terms',
    title: 'წესები და პირობები',
    sections: [
      '[სერვისის არსი: რას ყიდის DAJDA ზუსტად]',
      '[რა არ არის DAJDA: ბუკმეკერი, ფსონების ბირჟა, ფინანსური ინსტიტუტი. ეს პუნქტი ყველაზე მნიშვნელოვანია]',
      '[შინაარსის ხასიათი: ფსონი ავტორის მოსაზრებაა, გარანტია არ არსებობს]',
      '[ჩანაწერების უცვლელობა: რა იბლოკება გამოქვეყნების შემდეგ და როგორ ხდება შესწორება]',
      '[ასაკობრივი ზღვარი: 18+]',
      '[ანგარიშის შეჩერების საფუძვლები]',
      '[პასუხისმგებლობის შეზღუდვა]',
      '[მოქმედი კანონმდებლობა და დავების გადაწყვეტა]',
    ],
  },
  {
    id: 'privacy',
    title: 'კონფიდენციალურობა',
    sections: [
      '[რა მონაცემებს ვინახავთ: სახელი, ელფოსტა, პაროლის ჰეში, სესია, Telegram, გადახდების ისტორია. ჩამონათვალი კოდს უნდა დაემთხვეს]',
      '[რას არ ვინახავთ: ბარათის მონაცემები]',
      '[აუდიტის ჟურნალი: რა იწერება და რატომ]',
      '[მესამე მხარეები: გადახდის პროვაიდერი და რა გადაეცემა]',
      '[შენახვის ვადა]',
      '[მომხმარებლის უფლებები: წვდომა, შესწორება, წაშლა]',
      '[საკონტაქტო მისამართი მონაცემებთან დაკავშირებით]',
    ],
  },
  {
    id: 'refunds',
    title: 'დაბრუნების პოლიტიკა',
    sections: [
      '[რას იხდის მომხმარებელი: წვდომა შინაარსზე, არა შედეგზე]',
      '[როდის ბრუნდება თანხა: ტექნიკური ხარვეზი, ორმაგი ჩამოჭრა, არასანქცირებული გადახდა]',
      '[როდის არ ბრუნდება: წაგებული ფსონი არ არის საფუძველი. ეს პუნქტი ცალსახად უნდა ეწეროს]',
      '[გაუქმება: რა ხდება წვდომასთან პერიოდის ბოლომდე]',
      '[როგორ მოვითხოვოთ: არხი, საჭირო მონაცემები, განხილვის ვადა]',
    ],
  },
  {
    id: 'responsible-use',
    title: 'პასუხისმგებლიანი გამოყენება',
    sections: [
      '[სტატისტიკა არ არის დაპირება: ROI და სიზუსტე აღწერს წარსულს]',
      '[რატომ ვაქვეყნებთ წაგებულ ფსონებსაც]',
      '[მცირე შერჩევა: რატომ არ ენდობა მოკლე ისტორიას]',
      '[18+ და სად მიმართოს ადამიანმა, თუ თამაში პრობლემად ექცევა. საქართველოში მოქმედი დახმარების სამსახურის კონტაქტი უნდა მოიძებნოს]',
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl text-ink sm:text-4xl">
        იურიდიული ინფორმაცია
      </h1>

      <div className="mt-6">
        <Alert tone="warning" title="ტექსტი ჯერ არ არის დაწერილი">
          ქვემოთ მხოლოდ სტრუქტურაა: რა უნდა დაფაროს თითოეულმა დოკუმენტმა.
          საბოლოო ფორმულირება იურისტთან უნდა შეთანხმდეს გამოქვეყნებამდე.
        </Alert>
      </div>

      {/* Jump list, so a footer link can land on the right clause. */}
      <nav aria-label="დოკუმენტები" className="mt-8 border-y border-line py-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {DOCUMENTS.map((doc) => (
            <li key={doc.id}>
              <a
                href={`#${doc.id}`}
                className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {doc.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {DOCUMENTS.map((doc) => (
        <section
          key={doc.id}
          id={doc.id}
          aria-labelledby={`${doc.id}-heading`}
          className="scroll-mt-24 pt-12"
        >
          <h2
            id={`${doc.id}-heading`}
            className="font-display text-2xl text-ink"
          >
            {doc.title}
          </h2>

          <ol className="mt-5 border-t border-line">
            {doc.sections.map((section, index) => (
              <li
                key={section}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-b border-line py-4"
              >
                <span
                  className="tabular text-sm text-ink-faint"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <p className="ph text-sm leading-relaxed">{section}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
