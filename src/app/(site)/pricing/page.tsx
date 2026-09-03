import type { Metadata } from 'next';
import Link from 'next/link';
import { PaymentMarks } from '@/components/payment-marks';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const metadata: Metadata = {
  title: 'ფასები',
  description:
    'რა იყიდება DAJDA-ზე და რა ღირს: ავტორის თვიური გამოწერა 30, 40 ან 50 ლარი, ცალკეული ბილეთი ავტორის ფასით, ბალანსის შევსება. ყველა ფასი ლარში.',
};

/**
 * Every product the platform sells, with a description and a price in GEL.
 *
 * The payment provider requires this to exist as a page a reviewer can open,
 * and a reader deciding whether to pay deserves the same thing. The numbers
 * here are the ones the code enforces: PLAN_PRICES_MINOR in the analyst
 * actions for the subscription, the ticket price range in the validation
 * schema, and the top-up ceiling that matches the provider's per-transaction
 * limit. Change those and change this page.
 */
const PRODUCTS: {
  id: string;
  name: string;
  price: string;
  unit: string;
  description: string[];
}[] = [
  {
    id: 'subscription',
    name: 'ავტორის თვიური გამოწერა',
    price: '30, 40 ან 50 ₾',
    unit: 'თვეში, ფასს ავტორი ირჩევს',
    description: [
      'ერთი ავტორის ყველა ფასიან პროგნოზზე წვდომა კალენდარული თვის განმავლობაში: სპორტული მოვლენის ანალიზი, არჩეული პოზიციები, კოეფიციენტები და დაწყების დრო. ავტორი იღებს ვალდებულებას თვეში დეკლარირებულ მინიმალურ რაოდენობაზე, რომელიც მის გვერდზე გადახდამდე ჩანს.',
      'გამოწერა განახლდება ავტომატურად ყოველი თვის ბოლოს. გაუქმება შესაძლებელია ნებისმიერ დროს პროფილიდან; წვდომა რჩება გადახდილი პერიოდის ბოლომდე.',
    ],
  },
  {
    id: 'ticket',
    name: 'ცალკეული ფასიანი ბილეთი',
    price: '1-დან 500 ₾-მდე',
    unit: 'ერთჯერადად, ფასს ავტორი ადებს',
    description: [
      'ერთი კონკრეტული პროგნოზი, გამოწერის გარეშე. შეძენამდე ჩანს ავტორი, კოეფიციენტი, ფასი და პირველი პოზიციის დაწყების დრო; შეძენის შემდეგ იხსნება სრული ჩანაწერი და ანალიზი.',
      'ერთჯერადი შეძენაა, არ განახლდება და ხსნის მხოლოდ იმ ერთ ბილეთს.',
    ],
  },
  {
    id: 'balance',
    name: 'ბალანსის შევსება',
    price: '1-დან 500 ₾-მდე',
    unit: 'ერთ ოპერაციაზე',
    description: [
      'თანხა პლატფორმის შიდა ბალანსზე, რომლითაც შემდეგ იხდით გამოწერას ან ცალკეულ ბილეთს ბარათის ხელახლა შეყვანის გარეშე. ბალანსი გამოიყენება მხოლოდ პლატფორმაზე კონტენტის საყიდლად: არ არის საფსონე ანგარიში, არ ირიცხება პროცენტი და ბარათზე უკან არ ბრუნდება.',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">ფასები</h1>
        <p className="mt-3 text-ink-muted">
          DAJDA ყიდის მხოლოდ ერთ რამეს: ვერიფიცირებული ავტორის ანალიზზე
          წვდომას. ყველა ფასი მითითებულია ლარში და მოიცავს გადასახადებს.
        </p>
      </header>

      <dl className="mt-8 border-t border-line">
        {PRODUCTS.map((product) => (
          <div
            key={product.id}
            id={product.id}
            className="grid gap-x-8 gap-y-2 border-b border-line py-6 sm:grid-cols-[1fr_auto]"
          >
            <dt className="font-display text-lg text-ink sm:order-1">
              {product.name}
            </dt>
            <dd className="sm:order-2 sm:text-right">
              <p className="tabular text-2xl font-bold tracking-tight text-ink">
                {product.price}
              </p>
              <p className="text-xs text-ink-faint">{product.unit}</p>
            </dd>
            <dd className="space-y-2 sm:order-3 sm:col-span-2">
              {product.description.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[0.9375rem] leading-relaxed text-ink-muted"
                >
                  {paragraph}
                </p>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="payment-heading" className="mt-8">
        <h2 id="payment-heading" className="text-base font-semibold text-ink">
          გადახდა და მიწოდება
        </h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
          <p>
            გადახდას ამუშავებს ლიცენზირებული პროვაიდერი Flitt. ბარათის მონაცემები
            DAJDA-ს სერვერზე არ ინახება.
          </p>
          <p>
            ყველა პროდუქტი ციფრულია: წვდომა იხსნება ანგარიშში გადახდის
            დადასტურებისთანავე, როგორც წესი, რამდენიმე წამში. ფიზიკური
            მიწოდება არ ხორციელდება. თანხის დაბრუნების წესი აღწერილია{' '}
            <Link href="/legal#refunds" className="text-accent underline">
              დაბრუნების პოლიტიკაში
            </Link>
            , სრული პირობები კი{' '}
            <Link href="/legal#terms" className="text-accent underline">
              წესებსა და პირობებში
            </Link>
            .
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <span>მიიღება:</span>
          <PaymentMarks size="md" withWallets />
        </div>
      </section>

      <div className="mt-10">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
