import { getEnv } from '@/lib/env';

/**
 * Says out loud that this deployment is a demo.
 *
 * Rendered above the header on every page, unmissable and not dismissible.
 * The reasoning is the same one behind the `isDemo` badge on seeded content:
 * a person who lands on this site has no way to tell it apart from a real
 * one, and this site publishes performance records and asks for money. Being
 * quiet about it would be the dishonest option.
 *
 * It returns null in a normally-configured deployment, so it costs nothing to
 * leave mounted.
 */
export function DemoBanner() {
  if (!getEnv().DEMO_MODE) return null;

  return (
    <div className="border-b border-signal/30 bg-signal/10 px-4 py-2 text-center text-sm text-ink">
      <strong className="font-semibold">დემო ვერსია.</strong>{' '}
      მონაცემები გამოგონილია, გადახდა სიმულაციაა და რეალური თანხა არ ჩამოიჭრება.
    </div>
  );
}
