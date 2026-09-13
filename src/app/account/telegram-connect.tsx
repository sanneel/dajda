'use client';

import { useActionState, useEffect } from 'react';
import { Check, Send } from 'lucide-react';
import {
  startTelegramLinkAction,
  unlinkTelegramAction,
} from '@/actions/telegram';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Connect or disconnect the Telegram bot.
 *
 * There is no username field, deliberately. A bot cannot message a username -
 * only a chat it has been invited into - so asking for one would collect a
 * string that looks like an address and never delivers anything. Pressing
 * Start in the bot IS the address, and it is the one thing that cannot be
 * entered on somebody else's behalf.
 */
export function TelegramConnect({
  connected,
  username,
  configured,
}: {
  connected: boolean;
  username: string | null;
  /** False when the deployment has no bot; then there is nothing to offer. */
  configured: boolean;
}) {
  const [linkState, linkAction, linkPending] = useActionState(
    startTelegramLinkAction,
    null,
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkTelegramAction,
    null,
  );

  // Opening the link is the point of pressing the button, so it happens as
  // soon as the token exists rather than after a second click.
  useEffect(() => {
    if (linkState?.ok) {
      window.open(linkState.data.url, '_blank', 'noopener,noreferrer');
    }
  }, [linkState]);

  if (!configured) {
    return (
      <p className="text-sm text-ink-muted">
        Telegram-ის ბოტი ამ დაყენებაზე ჯერ არ არის კონფიგურირებული.
      </p>
    );
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-win">
          <Check className="size-4" aria-hidden="true" />
          დაკავშირებულია{username ? ` (@${username})` : ''}
        </p>
        <p className="text-sm text-ink-muted">
          შეტყობინებები მოდის Telegram-ში. გამორთვა შეგიძლიათ აქაც ან ბოტში
          ბრძანებით <span className="tabular">/stop</span>.
        </p>

        {unlinkState && !unlinkState.ok ? (
          <Alert tone="error">{unlinkState.error.message}</Alert>
        ) : null}

        <form action={unlinkAction}>
          <Button type="submit" variant="secondary" size="sm" disabled={unlinkPending}>
            {unlinkPending ? 'ითიშება…' : 'გათიშვა'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        დააჭირეთ ღილაკს, გაიხსნება ბოტი და იქ დააჭირეთ{' '}
        <span className="font-medium text-ink">Start</span>. ამის შემდეგ
        ავტორების შეტყობინებები მოვა Telegram-ში.
      </p>

      {linkState && !linkState.ok ? (
        <Alert tone="error">{linkState.error.message}</Alert>
      ) : null}

      {linkState?.ok ? (
        <Alert tone="success" title="ბოტი გაიხსნა">
          დააჭირეთ Start-ს ბოტში, შემდეგ განაახლეთ ეს გვერდი. თუ ბოტი არ
          გაიხსნა,{' '}
          <a
            href={linkState.data.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            გახსენით ხელით
          </a>
          . ბმული 30 წუთია აქტიური.
        </Alert>
      ) : null}

      <form action={linkAction}>
        <Button type="submit" disabled={linkPending}>
          <Send className="size-4" aria-hidden="true" />
          {linkPending ? 'მზადდება…' : 'Telegram-ის დაკავშირება'}
        </Button>
      </form>
    </div>
  );
}
