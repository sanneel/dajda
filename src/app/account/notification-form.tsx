'use client';

import { useActionState, useRef } from 'react';
import { updateNotificationPreferencesAction } from '@/actions/account';
import { Checkbox } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';

/**
 * Each switch saves itself.
 *
 * There is no partial state here worth batching: five independent switches,
 * every one of them meaningful on its own. A save button under them only
 * created a way to lose a change - toggle, navigate, and the preference
 * silently never happened - and put a second identically-labelled შენახვა on
 * a page that already had one.
 */

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
  const formRef = useRef<HTMLFormElement>(null);

  // Submits the whole form, so a switch always saves the set as it now
  // stands rather than its own value against a stale copy of the others.
  const save = () => formRef.current?.requestSubmit();

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-4"
      noValidate
      // React 19 resets the form after every action; canceling the reset
      // keeps what was typed (see register-form for the full story).
      onReset={(event) => event.preventDefault()}
    >
      {pending ? (
        <p className="text-xs text-ink-faint" role="status">ინახება…</p>
      ) : state?.ok ? (
        <p className="text-xs text-ink-muted" role="status">შენახულია.</p>
      ) : null}
      {state && !state.ok && !fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">ელფოსტა</legend>

        <Checkbox
          id="emailOnNewPrediction"
          name="emailOnNewPrediction"
          defaultChecked={defaults.emailOnNewPrediction}
          onChange={save}
          label="ახალი ფსონი გამოწერილი ავტორისგან"
        />
        <Checkbox
          id="emailOnSettlement"
          name="emailOnSettlement"
          defaultChecked={defaults.emailOnSettlement}
          onChange={save}
          label="ნანახი ფსონის შედეგი დაფიქსირდა"
        />
        <Checkbox
          id="emailOnLiveSession"
          name="emailOnLiveSession"
          defaultChecked={defaults.emailOnLiveSession}
          onChange={save}
          label="გამოწერილმა ავტორმა ლაივი გამოაცხადა"
        />
        <Checkbox
          id="emailProductUpdates"
          name="emailProductUpdates"
          defaultChecked={defaults.emailProductUpdates}
          onChange={save}
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
          onChange={save}
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

      {/* No save button: every switch above has already saved itself. */}
    </form>
  );
}
