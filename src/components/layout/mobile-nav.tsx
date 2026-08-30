'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthLinks } from '@/components/auth/auth-buttons';
import { NAV_ITEMS } from './nav-items';

/**
 * Mobile navigation sheet.
 *
 * Closes on route change and on Escape, and moves focus to the panel when it
 * opens so keyboard users are not left behind the toggle.
 */
export function MobileNav({
  isAuthenticated,
  isAdmin,
  isAnalyst = false,
  profileHref,
}: {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAnalyst?: boolean;
  /** An analyst's public profile, when they have one. */
  profileHref?: string | null;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * The sheet is open only while the route it was opened on is still current.
   * Deriving it this way closes the menu on navigation without an effect that
   * calls setState - no cascading render, and no stale-open flash.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Uses the state setter directly - it is stable, so the effect does not
      // need to re-subscribe on every render.
      if (event.key === 'Escape') setOpenedOn(null);
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    // Prevent the page behind the sheet from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? 'მენიუს დახურვა' : 'მენიუს გახსნა'}
        className="inline-flex size-11 items-center justify-center rounded-md border border-line text-ink"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 top-[4.25rem] z-40 overflow-y-auto border-t border-line bg-surface px-4 py-5 pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
        >
          <nav aria-label="მთავარი ნავიგაცია">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-12 items-center rounded-md px-3 text-base text-ink hover:bg-elevated"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {isAnalyst ? (
                <li>
                  <Link
                    href={profileHref ?? '/analyst'}
                    className="flex min-h-12 items-center rounded-md px-3 text-base text-accent hover:bg-elevated"
                  >
                    პროფილი
                  </Link>
                </li>
              ) : null}
              {isAdmin ? (
                <li>
                  <Link
                    href="/admin"
                    className="flex min-h-12 items-center rounded-md px-3 text-base text-accent hover:bg-elevated"
                  >
                    ადმინი
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-5">
            <span className="text-sm text-ink-muted">თემა</span>
            <ThemeToggle />
          </div>

          <div className="mt-5 space-y-2 border-t border-line pt-5">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="flex min-h-12 items-center justify-center rounded-md border border-line text-base text-ink"
              >
                პროფილი
              </Link>
            ) : (
              <AuthLinks />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
