import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getEnv } from '@/lib/env';
import { formatMoney } from '@/lib/format';
import { Logo } from '@/components/brand/logo';
import { Alert } from '@/components/ui/feedback';
import { SimulatePaymentPanel } from './simulate-panel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'სატესტო გადახდა',
  robots: { index: false, follow: false },
};

/**
 * Stand-in for the gateway's hosted checkout page.
 *
 * Nothing here changes the subscription. The buttons trigger a signed
 * server-to-server webhook, exactly as a real gateway would.
 */
export default async function DevCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const env = getEnv();
  if (env.PAYMENT_PROVIDER !== 'mock') notFound();

  const params = await searchParams;
  const orderId = typeof params.order === 'string' ? params.order : '';
  const amount = Number(params.amount ?? 0);
  const currency = typeof params.currency === 'string' ? params.currency : 'GEL';

  if (!orderId) notFound();

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10"
    >
      <div className="rounded-md border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <Logo size={24} />
          <span className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs font-medium text-ink-faint">
            სატესტო რეჟიმი
          </span>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
          გადახდის სიმულაცია
        </h1>

        <dl className="mt-4 space-y-2 rounded border border-line bg-canvas p-3.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">შეკვეთა</dt>
            <dd className="tabular text-xs text-ink">{orderId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">თანხა</dt>
            <dd className="tabular text-ink">
              {formatMoney(amount, currency)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <Alert tone="info" title="რას აკეთებს ეს გვერდი">
            ღილაკები აგზავნის ხელმოწერილ webhook-ს სერვერიდან სერვერზე. ამ
            გვერდზე დაბრუნება გამოწერას არ ააქტიურებს: მხოლოდ დადასტურებული
            webhook ცვლის სტატუსს.
          </Alert>
        </div>

        <div className="mt-5">
          <SimulatePaymentPanel orderId={orderId} />
        </div>

        <p className="mt-6 border-t border-line pt-4 text-sm">
          <Link
            href="/dashboard"
            className="text-accent hover:underline"
          >
            გამოწერების გვერდზე დაბრუნება
          </Link>
        </p>
      </div>
    </main>
  );
}
