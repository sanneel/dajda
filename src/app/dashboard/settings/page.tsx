import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { telegramBotConfigured } from '@/lib/auth/telegram';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ProfileForm } from './profile-form';
import { NotificationForm } from './notification-form';
import { TelegramConnect } from './telegram-connect';

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
      select: {
        name: true,
        email: true,
        telegramUsername: true,
        telegramChatId: true,
      },
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
            title="Telegram"
            description="შეტყობინებები ბოტიდან. ბოტი პირველ შეტყობინებას ვერ გიგზავნით სანამ თქვენ არ დაიწყებთ საუბარს."
          />
          <CardBody>
            <TelegramConnect
              connected={user.telegramChatId !== null}
              username={user.telegramUsername}
              configured={telegramBotConfigured()}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="შეტყობინებები"
            description="რაზე მოგივიდეთ შეტყობინება. ელფოსტის გაგზავნა ჯერ არ არის აქტიური."
          />
          <CardBody>
            <NotificationForm
              defaults={{
                ...(preferences ?? {
                  emailOnNewPrediction: true,
                  emailOnSettlement: true,
                  emailOnLiveSession: true,
                  emailProductUpdates: false,
                  telegramEnabled: false,
                  telegramUsername: null,
                }),
                telegramConnected: user.telegramChatId !== null,
              }}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
