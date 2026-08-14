'use client';

import { LogOut } from 'lucide-react';
import { logoutAction } from '@/actions/auth';

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-loss"
      >
        <LogOut className="size-4" aria-hidden="true" />
        გამოსვლა
      </button>
    </form>
  );
}
