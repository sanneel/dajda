import { Send } from 'lucide-react';
import { telegramLoginUrl } from '@/lib/auth/telegram';

/**
 * "Log in with Telegram", rendered only when a bot is configured.
 *
 * A plain link, not the official widget: the widget is a third-party script
 * plus an iframe, which the CSP has no reason to start allowing when a
 * redirect link does the same job inside the site's own visual language.
 * Server component - it reads env for the bot id.
 */
export function TelegramLoginButton() {
  const url = telegramLoginUrl();
  if (!url) return null;

  return (
    <div>
      <div
        className="my-5 flex items-center gap-3 text-xs text-ink-faint"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-line" />
        ან
        <span className="h-px flex-1 bg-line" />
      </div>

      <a
        href={url}
        className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2.5 rounded-control border border-line-strong bg-surface px-7 text-base font-semibold text-ink transition-colors hover:border-ink-faint hover:bg-elevated"
      >
        <Send className="size-4.5 text-accent" aria-hidden="true" />
        Telegram-ით შესვლა
      </a>
    </div>
  );
}
