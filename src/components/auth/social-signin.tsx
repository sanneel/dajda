import { Send } from 'lucide-react';
import { telegramLoginUrl } from '@/lib/auth/telegram';
import { googleConfigured } from '@/lib/auth/google';

/**
 * Telegram and Google sign-in, above the email form.
 *
 * They used to sit underneath it, after the password field, the terms
 * checkbox and the submit button - which put the slowest way in first and the
 * one-tap ways in last, where a phone only reaches them by scrolling past a
 * form it never needed to fill. Leading with them costs nothing to somebody
 * who wants an email account: the divider tells them the form is right there.
 *
 * Server component: both buttons read env to decide whether they exist at
 * all, so a deployment with no bot or no Google client simply renders less.
 * Plain links rather than the official widgets - each of those is a
 * third-party script the CSP has no reason to start allowing when a redirect
 * does the same job in the site's own visual language.
 */
export function SocialSignIn() {
  const telegramUrl = telegramLoginUrl();
  const google = googleConfigured();

  // Nothing configured: no buttons, and no orphan "ან" divider above a form.
  if (!telegramUrl && !google) return null;

  return (
    <div className="mb-5">
      <div className="space-y-3">
        {telegramUrl ? (
          <a
            href={telegramUrl}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2.5 rounded-control border border-line-strong bg-surface px-7 text-base font-semibold text-ink transition-colors hover:border-ink-faint hover:bg-elevated"
          >
            <Send className="size-4.5 text-accent" aria-hidden="true" />
            Telegram-ით შესვლა
          </a>
        ) : null}

        {google ? (
          <a
            href="/api/auth/google"
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2.5 rounded-control border border-line-strong bg-surface px-7 text-base font-semibold text-ink transition-colors hover:border-ink-faint hover:bg-elevated"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Google-ით შესვლა
          </a>
        ) : null}
      </div>

      <div
        className="mt-5 flex items-center gap-3 text-xs text-ink-faint"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-line" />
        ან ელფოსტით
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
