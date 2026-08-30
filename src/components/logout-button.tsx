'use client';

import { LogOut } from 'lucide-react';
import { logoutAction } from '@/actions/auth';

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label="გამოსვლა"
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-loss"
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        {/* The word costs the row's last free space on a phone; the icon
            plus aria-label carries it there. */}
        <span className="hidden sm:inline">გამოსვლა</span>
      </button>
    </form>
  );
}
