'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { buttonClass } from '@/components/ui/button';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

type Mode = 'login' | 'register';

/**
 * Header sign-in and sign-up, as dialogs rather than page loads.
 *
 * Signing in is not a destination. Sending someone to a separate page to do it
 * throws away whatever they were reading, and after the redirect back they
 * have lost their place. A dialog keeps the page underneath.
 *
 * `/login` and `/register` still exist as real routes and are not going away.
 * They are what a bookmark, an expired-session redirect and a browser with no
 * JavaScript all land on, and the same two form components render in both
 * places, so there is one implementation rather than two that drift.
 */
export function AuthButtons({
  // Read on the server by SiteHeader and passed down: this is a client
  // component, and env is not readable from the browser.
  telegramConfigured,
}: {
  telegramConfigured: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setMode('login')}
        className={buttonClass('secondary', 'md')}
      >
        შესვლა
      </button>
      <button
        type="button"
        onClick={() => setMode('register')}
        className={buttonClass('primary', 'md')}
      >
        რეგისტრაცია
      </button>

      <Modal
        open={mode === 'login'}
        onClose={() => setMode(null)}
        title="შესვლა"
      >
        <LoginForm />
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">
          ანგარიში არ გაქვთ?{' '}
          <button
            type="button"
            onClick={() => setMode('register')}
            className="text-accent hover:underline"
          >
            რეგისტრაცია
          </button>
        </p>
      </Modal>

      <Modal
        open={mode === 'register'}
        onClose={() => setMode(null)}
        title="რეგისტრაცია"
      >
        <RegisterForm telegramConfigured={telegramConfigured} />
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">
          უკვე გაქვთ ანგარიში?{' '}
          <button
            type="button"
            onClick={() => setMode('login')}
            className="text-accent hover:underline"
          >
            შესვლა
          </button>
        </p>
      </Modal>
    </>
  );
}

/**
 * The same pair for the mobile drawer, where a dialog on top of a drawer is
 * one layer too many. These are plain links to the real routes.
 */
export function AuthLinks() {
  return (
    <>
      <Link
        href="/login"
        className="flex min-h-12 items-center justify-center rounded-md border border-line text-base text-ink"
      >
        შესვლა
      </Link>
      <Link
        href="/register"
        className="flex min-h-12 items-center justify-center rounded-md bg-ink text-base font-semibold text-on-ink"
      >
        რეგისტრაცია
      </Link>
    </>
  );
}
