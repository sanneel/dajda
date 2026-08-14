import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ProfileForm } from './profile-form';
import { NotificationForm } from './notification-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'პარამეტრები',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const actor = await requireUser();

  const [user, preferences] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true, email: true, telegramUsername: true },
    }),
    prisma.notificationPreference.findUnique({
      where: { userId: actor.userId },
      select: {
        emailOnNewPrediction: true,
        emailOnSettlement: true,
        emailOnLiveSession: true,
        emailProductUpdates: true,
        telegramEnabled: true,
        telegramUsername: true,
      },
    }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          პარამეტრები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ანგარიშის მონაცემები და შეტყობინებების პრეფერენციები.
        </p>
      </header>

      <Card>
        <CardHeader title="ანგარიში" />
        <CardBody>
          <ProfileForm
            defaultName={user.name}
            defaultTelegram={user.telegramUsername ?? ''}
            email={user.email}
          />
        </CardBody>
      </Card>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="შეტყობინებები"
            description="Telegram-ის ინტეგრაცია ჯერ არ არის აქტიური: არჩევანი შეინახება მომავლისთვის."
          />
          <CardBody>
            <NotificationForm
              defaults={
                preferences ?? {
                  emailOnNewPrediction: true,
                  emailOnSettlement: true,
                  emailOnLiveSession: true,
                  emailProductUpdates: false,
                  telegramEnabled: false,
                  telegramUsername: null,
                }
              }
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
