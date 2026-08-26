'use client';

import { useActionState } from 'react';
import { updateNotificationPreferencesAction } from '@/actions/account';
import { Checkbox } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function NotificationForm({
  defaults,
}: {
  defaults: {
    emailOnNewPrediction: boolean;
    emailOnSettlement: boolean;
    emailOnLiveSession: boolean;
    emailProductUpdates: boolean;
    telegramEnabled: boolean;
    telegramUsername: string | null;
    /** Whether a chat is actually connected, so the switch can say so. */
    telegramConnected: boolean;
  };
}) {
  const [state, action, pending] = useActionState(
    updateNotificationPreferencesAction,
    null,
  );

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.ok ? <Alert tone="success">პრეფერენციები შენახულია.</Alert> : null}
      {state && !state.ok && !fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">ელფოსტა</legend>

        <Checkbox
          id="emailOnNewPrediction"
          name="emailOnNewPrediction"
          defaultChecked={defaults.emailOnNewPrediction}
          label="ახალი ფსონი გამოწერილი ავტორისგან"
        />
        <Checkbox
          id="emailOnSettlement"
          name="emailOnSettlement"
          defaultChecked={defaults.emailOnSettlement}
          label="ნანახი ფსონის შედეგი დაფიქსირდა"
        />
        <Checkbox
          id="emailOnLiveSession"
          name="emailOnLiveSession"
          defaultChecked={defaults.emailOnLiveSession}
          label="გამოწერილმა ავტორმა ლაივი გამოაცხადა"
        />
        <Checkbox
          id="emailProductUpdates"
          name="emailProductUpdates"
          defaultChecked={defaults.emailProductUpdates}
          label="პლატფორმის სიახლეები"
        />
      </fieldset>

      <fieldset className="border-t border-line pt-4">
        <legend className="mb-1 text-sm font-medium text-ink">Telegram</legend>

        {/*
         * The switch, not the address. The address is the chat itself and is
         * set by pressing Start in the bot, one card above - there is nothing
         * here for a person to type, and a username field would collect a
         * string that looks like an address and delivers nothing.
         */}
        <Checkbox
          id="telegramEnabled"
          name="telegramEnabled"
          defaultChecked={defaults.telegramEnabled}
          label="შეტყობინებები Telegram-ში"
        />
        {!defaults.telegramConnected ? (
          <p className="text-xs text-ink-faint">
            ჯერ დააკავშირეთ ბოტი ზემოთ, თორემ გასაგზავნი მისამართი არ არსებობს.
          </p>
        ) : null}
        <input
          type="hidden"
          name="telegramUsername"
          value={defaults.telegramUsername ?? ''}
        />
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? 'ინახება…' : 'შენახვა'}
      </Button>
    </form>
  );
}
