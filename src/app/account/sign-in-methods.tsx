import { KeyRound, MessageCircle } from 'lucide-react';

/**
 * How this account gets in.
 *
 * Read-only, and deliberately so: this build has no password change, no
 * session list and no way to detach a linked identity, so anything here that
 * looked like a control would be a promise the product cannot keep. What it
 * can honestly answer is "which of these opens my account", which is the
 * question someone lands on this tab with.
 */
export function SignInMethods({
  hasPassword,
  googleLinked,
  telegramLinked,
}: {
  hasPassword: boolean;
  googleLinked: boolean;
  telegramLinked: boolean;
}) {
  const methods = [
    {
      id: 'password',
      label: 'პაროლი',
      icon: <KeyRound className="size-4" aria-hidden="true" />,
      active: hasPassword,
    },
    {
      id: 'google',
      label: 'Google',
      icon: (
        <span aria-hidden="true" className="text-sm font-semibold">
          G
        </span>
      ),
      active: googleLinked,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      active: telegramLinked,
    },
  ];

  return (
    <ul className="divide-y divide-line">
      {methods.map((method) => (
        <li
          key={method.id}
          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="flex items-center gap-2.5 text-sm text-ink">
            <span className="inline-flex size-8 items-center justify-center rounded-full border border-line text-ink-faint">
              {method.icon}
            </span>
            {method.label}
          </span>
          <span
            className={`text-xs ${method.active ? 'text-ink-muted' : 'text-ink-faint'}`}
          >
            {method.active ? 'დაკავშირებულია' : 'არ არის დაკავშირებული'}
          </span>
        </li>
      ))}
    </ul>
  );
}
