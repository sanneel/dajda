import type { Metadata } from 'next';
import Link from 'next/link';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const metadata: Metadata = {
  title: 'როგორ მუშაობს?',
  description: 'როგორ მუშაობს DAJDA: პროგნოზი ქვეყნდება მოვლენამდე, შედეგი ფიქსირდება უცვლელად, გამოწერა უქმდება ნებისმიერ დროს.',
};

/**
 * How the platform works.
 *
 * Written as questions and answers rather than as a row of numbered steps.
 * The numbered strip that used to sit on the home page said very little in
 * three boxes; the questions here are the ones a reader actually arrives
 * with, and each answer can be as long as it needs to be.
 *
 * The section about what is locked after publication is the important one:
 * it describes a guarantee the schema enforces (see FROZEN_FIELDS and the
 * PredictionEdit ledger), not a marketing claim, so it must stay accurate to
 * the code.
 */
const SECTIONS = [
  {
    id: 'record',
    question: 'რას ნიშნავს „გამჭვირვალე ჩანაწერი"?',
    body: [
      'ყველა ავტორზე ჩანს სიზუსტე, ჩანაწერი, პროგნოზების რაოდენობა და შედეგი ერთეულებში. ციფრები ითვლება მხოლოდ გამოქვეყნებული და დასრულებული პროგნოზებიდან; ხელით არაფერი იწერება.',
      'სტატისტიკაში აისახება ყველა პროგნოზი, წაგებულების ჩათვლით. გამოქვეყნებული ჩანაწერი უცვლელია, ამიტომ ისტორიის გალამაზება შეუძლებელია. ყველა მაჩვენებელი წარსულ შედეგებს ასახავს და მომავლის გარანტია არ არის.',
    ],
  },
  {
    id: 'locked',
    question: 'რა იბლოკება გამოქვეყნების შემდეგ?',
    body: [
      'გამოქვეყნების შემდეგ ავტორი ვეღარ შეცვლის ფსონის სკრინშოტს, კოეფიციენტს, ერთეულს, სპორტს და გამოქვეყნების დროს.',
      'შესწორება შესაძლებელია, მაგრამ მხოლოდ ახალი ვერსიის სახით: ძველი ჩანაწერი რჩება საჯაროდ და ორივე ერთმანეთზეა მიბმული. ცვლილების ყველა მცდელობა ინახება, მათ შორის უარყოფილი.',
    ],
  },
  {
    id: 'settlement',
    question: 'ვინ აფიქსირებს შედეგს?',
    body: [
      'ავტორი მატჩის დასრულების შემდეგ ნიშნავს ფსონს დასრულებულად და, სასურველია, ურთავს შედეგის სკრინშოტს. შედეგს ავტორი არ ირჩევს.',
      'დაჯდა თუ ვერ დაჯდა, ამას ადმინი წყვეტს სკრინშოტის შემოწმების შემდეგ. თუ შედეგის სკრინშოტი არ არის, ადმინი ხელით ამოწმებს.',
    ],
  },
  {
    id: 'free',
    question: 'რა არის უფასო პროგნოზები?',
    body: [
      'უფასო პროგნოზი ნებისმიერ ავტორიზებულ მომხმარებელს შეუძლია ატვირთოს, ანალიტიკოსსაც და ჩვეულებრივ მომხმარებელსაც.',
      'ასეთი პროგნოზი არავის სტატისტიკაში არ ითვლება: ის არც სიზუსტეზე მოქმედებს და არც ერთეულებზე. ავტორის ჩანაწერს მხოლოდ მისივე გამოქვეყნებული პროგნოზები ქმნის.',
    ],
  },
  {
    id: 'live',
    question: 'რა არის ლაივი?',
    body: [
      'ანალიტიკოსს შეუძლია წინასწარ გამოაცხადოს, რომ კონკრეტულ დროს კონკრეტულ მატჩზე ლაივში დაიწყებს პოსტინგს.',
      'გამომწერებსა და შემნახველებს ამის შესახებ მიდის შეტყობინება მეილზე ან ტელეგრამზე. შეტყობინებებს მართავთ პროფილის პარამეტრებში.',
    ],
  },
  {
    id: 'money',
    question: 'ფსონს იღებთ?',
    body: [
      'არა. DAJDA არ არის ბუკმეკერი: არ იღებს ფსონს და არ იხდის მოგებას. გადახდა ხდება მხოლოდ ანალიტიკოსის ანალიზზე წვდომის გამოწერისთვის.',
      'გამოწერა ღირს 30, 40 ან 50 ლარი თვეში, ფასს ავტორი ირჩევს. გამოწერა განახლდება ავტომატურად ყოველ თვეს; გაუქმება შესაძლებელია ნებისმიერ დროს პროფილიდან და წვდომა რჩება გადახდილი პერიოდის ბოლომდე.',
      'შიდა ბალანსი გამოიყენება მხოლოდ პლატფორმაზე გამოწერის გადასახდელად. ის არ არის საფსონე ანგარიში: მასზე ფსონი არ იდება და მოგება არ ირიცხება.',
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          როგორ მუშაობს?
        </h1>
        <p className="ph mt-3">
          პროგნოზი ქვეყნდება მოვლენამდე, შედეგი ფიქსირდება უცვლელად და
          სტატისტიკა შემოწმებადია. აი, როგორ.
        </p>
      </header>

      {/*
       * A description list, not an accordion. There are six answers and none
       * of them is long; hiding them behind toggles would add a click to
       * every one of them in exchange for a shorter scrollbar.
       */}
      <dl className="mt-8 border-t border-line">
        {SECTIONS.map((section) => (
          <div key={section.id} id={section.id} className="border-b border-line py-6">
            <dt className="font-display text-lg text-ink">
              {section.question}
            </dt>
            <dd className="mt-2 space-y-3">
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className={`text-[0.9375rem] leading-relaxed ${
                    paragraph.startsWith('[') ? 'ph' : 'text-ink-muted'
                  }`}
                >
                  {paragraph}
                </p>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-sm text-ink-muted">
        დეტალური პირობები:{' '}
        <Link href="/legal" className="text-accent underline">
          წესები, კონფიდენციალურობა და დაბრუნება
        </Link>
      </p>

      <div className="mt-10">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
