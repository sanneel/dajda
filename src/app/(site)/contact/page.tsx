import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY } from '@/lib/company';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'კონტაქტი',
  description:
    'დაგვიკავშირდით: მხარდაჭერა, თანხის დაბრუნების მოთხოვნა და თანამშრომლობა ავტორებთან.',
};

/**
 * One page with every way to reach the company.
 *
 * The requisites come from the same module the legal documents read, so the
 * entity a visitor writes to and the entity the terms bind is one and the
 * same by construction.
 */
const CHANNELS = [
  {
    icon: Mail,
    label: 'ელფოსტა',
    value: COMPANY.supportEmail,
    href: `mailto:${COMPANY.supportEmail}`,
    note: 'მხარდაჭერა, თანხის დაბრუნების მოთხოვნა, ავტორად გახდომა. ვპასუხობთ 2 სამუშაო დღეში.',
  },
  {
    icon: Phone,
    label: 'ტელეფონი',
    value: COMPANY.phone,
    href: null,
    note: 'სამუშაო დღეებში, 10:00 საათიდან 18:00 საათამდე.',
  },
  {
    icon: MapPin,
    label: 'მისამართი',
    value: COMPANY.addressKa,
    href: null,
    note: `${COMPANY.nameKa} · ს/კ ${COMPANY.legalId}`,
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">კონტაქტი</h1>
        <p className="ph mt-3">
          კითხვა, პრობლემა გადახდასთან თუ სურვილი, გახდე ავტორი: მოგვწერე და
          გიპასუხებთ.
        </p>
      </header>

      <div className="mt-8">
        <Card>
          <CardHeader title="საკონტაქტო არხები" level={2} />
          <CardBody>
            <ul className="divide-y divide-line">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                return (
                  <li key={channel.label} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-muted">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-ink-muted">{channel.label}</p>
                      {channel.href ? (
                        <a
                          href={channel.href}
                          className="text-base font-medium text-accent hover:underline"
                        >
                          {channel.value}
                        </a>
                      ) : (
                        <p className="text-base font-medium text-ink">
                          {channel.value}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-ink-faint">
                        {channel.note}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        თანხის დაბრუნების პირობები აღწერილია{' '}
        <Link href="/legal#refunds" className="text-accent underline">
          დაბრუნების პოლიტიკაში
        </Link>
        . მოთხოვნას განვიხილავთ 5 სამუშაო დღეში.
      </p>
    </div>
  );
}
