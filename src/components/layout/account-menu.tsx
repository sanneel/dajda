'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ExternalLink,
  LogOut,
  Rss,
  Settings,
  Ticket,
  User,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { logoutAction } from '@/actions/auth';

/**
 * The account drawer, opened from the avatar.
 *
 * These entries used to be a strip of links across the top of every dashboard
 * page, which meant the account pages carried a navigation bar that no other
 * page had and that only mattered once you were already inside them. They
 * belong to the avatar: it is the one control on every page that means "me",
 * and it was a plain link to a single destination.
 *
 * Right-hand sheet on every width rather than a dropdown, so the same
 * component serves a phone and a desktop and the touch targets stay honest.
 */
export function AccountMenu({
  name,
  photoPath = null,
  analystStatus,
  isAdmin = false,
  profileHref = null,
}: {
  name: string;
  /** The analyst's photograph, when they have one. */
  photoPath?: string | null;
  analystStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
  isAdmin?: boolean;
  /** The analyst's public page, when they have one. */
  profileHref?: string | null;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Open only while the route it was opened on is still current, which closes
   * the sheet on navigation without an effect that sets state. Same approach
   * as the main mobile nav, for the same reason.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenedOn(null);
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="account-panel"
        aria-label={`ანგარიშის მენიუ — ${name}`}
        title={name}
        className="inline-flex size-11 items-center justify-center rounded-full transition-opacity hover:opacity-80"
      >
        <Avatar name={name} src={photoPath} size="sm" />
      </button>

      {open ? (
        <>
          {/* The page behind stays visible but takes the tap that closes. */}
          <button
            type="button"
            aria-label="მენიუს დახურვა"
            onClick={() => setOpenedOn(null)}
            className="fixed inset-0 z-40 cursor-default bg-ink/40"
          />

          <div
            id="account-panel"
            ref={panelRef}
            tabIndex={-1}
            /*
             * The phone's tab bar is fixed over the bottom of the screen, so
             * a panel that only clears the safe area puts its last row -
             * გამოსვლა - underneath it. Reserve the bar's height, as the main
             * menu does; the desktop breakpoint has no bar and no padding.
             */
            className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto border-l border-line bg-surface pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={name} src={photoPath} size="md" />
                <span className="truncate font-medium text-ink">{name}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpenedOn(null)}
                aria-label="დახურვა"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-elevated hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="ანგარიშის ნავიგაცია" className="flex-1 p-3">
              <ul className="space-y-1">
                <li>
                  {/* One entry, because there is one account page: the
                      settings that were spread across its tabs are all on
                      it now, in one column. */}
                  <Item href="/account" icon={<User className="size-4" />}>
                    ანგარიში
                  </Item>
                </li>

                <li>
                  {/*
                   * The reader's own timeline. Everywhere else on the site
                   * is arranged by the thing - free bets, paid bets, one
                   * author's record - which answers "who is good" and not
                   * "what is new from the people I already chose".
                   */}
                  <Item href="/feed" icon={<Rss className="size-4" />}>
                    ფიდი
                  </Item>
                </li>

                {/*
                 * Three states, not two: an approved analyst gets their
                 * workspace and their public page, a pending applicant the
                 * status of the application, everyone else the way to apply.
                 */}
                {analystStatus === 'APPROVED' ? (
                  <>
                    <li>
                      <Item href="/analyst" icon={<Ticket className="size-4" />}>
                        ჩემი ფსონები
                      </Item>
                    </li>
                    {profileHref ? (
                      <li>
                        <Item
                          href={profileHref}
                          icon={<ExternalLink className="size-4" />}
                        >
                          საჯარო გვერდი
                        </Item>
                      </li>
                    ) : null}
                  </>
                ) : analystStatus === 'PENDING' ? (
                  <li>
                    <Item href="/apply" icon={<Ticket className="size-4" />}>
                      განაცხადი…
                    </Item>
                  </li>
                ) : (
                  <li>
                    <Item href="/apply" icon={<Ticket className="size-4" />}>
                      ანალიტიკოსობა
                    </Item>
                  </li>
                )}

                {isAdmin ? (
                  <li>
                    <Item href="/admin" icon={<Settings className="size-4" />}>
                      ადმინი
                    </Item>
                  </li>
                ) : null}
              </ul>
            </nav>

            <div className="border-t border-line p-3">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-loss"
                >
                  <LogOut className="size-4 shrink-0" aria-hidden="true" />
                  გამოსვლა
                </button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function Item({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm text-ink transition-colors hover:bg-elevated"
    >
      <span className="shrink-0 text-ink-faint" aria-hidden="true">
        {icon}
      </span>
      {children}
    </Link>
  );
}
