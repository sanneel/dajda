'use client';

import { useState, useSyncExternalStore } from 'react';
import { Megaphone, MessageSquare, Plus, Radio, MoreHorizontal } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PostBetForm } from './post-form';
import { NoteForm, LiveForm } from './composer';
import { BroadcastForm } from './broadcast-form';

type Sheet = 'ticket' | 'note' | 'live' | 'broadcast' | null;

/**
 * True once React has attached its handlers. Server HTML arrives with the
 * button fully styled but inert until the bundle loads, and on a slow
 * connection an author pressed it twice for nothing before the third worked.
 * Rendering it disabled until hydration makes the wait visible instead of
 * silent. The snapshot flips only on the client, which is the whole point.
 */
const subscribeToNothing = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * The workspace's action bar: one strong CTA, everything else behind a menu.
 *
 * Posting a ticket is why an analyst opens this page; writing a status,
 * announcing a live session and messaging subscribers are things they do
 * occasionally. Giving all four equal billing as a tab strip - which is what
 * this was - made the common case cost a decision. Now the common case is a
 * button and the rest live under one "more" control.
 *
 * All four open in a drawer rather than inline. A composer that pushes the
 * page down loses the reader's place and, on a phone, hides the very list they
 * were looking at; a sheet leaves the workspace where it was.
 */
export function CreateActions({
  sports,
  defaultSportId,
  audienceSize,
  broadcastsRemaining,
  broadcastsPerDay,
}: {
  sports: { value: string; label: string }[];
  defaultSportId?: string;
  audienceSize: number;
  broadcastsRemaining: number;
  broadcastsPerDay: number;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hydrated = useHydrated();

  const close = () => setSheet(null);
  const open = (next: Sheet) => {
    setMenuOpen(false);
    setSheet(next);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => open('ticket')}
          disabled={!hydrated}
          aria-busy={!hydrated || undefined}
        >
          <Plus className="size-4" aria-hidden="true" />
          ბილეთის დამატება
        </Button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="სხვა ქმედებები"
            className="inline-flex size-11 items-center justify-center rounded-control border border-line-strong text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <>
              {/* Click-away catcher: a menu that only closes on its own items
                  is a menu people end up tapping around. */}
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-panel"
              >
                <MenuItem
                  onSelect={() => open('note')}
                  icon={<MessageSquare className="size-4" aria-hidden="true" />}
                  label="სტატუსი"
                  hint="ჩანს ფიდზე"
                />
                <MenuItem
                  onSelect={() => open('live')}
                  icon={<Radio className="size-4" aria-hidden="true" />}
                  label="ლაივის გამოცხადება"
                  hint="შეტყობინება მიდის"
                />
                <MenuItem
                  onSelect={() => open('broadcast')}
                  icon={<Megaphone className="size-4" aria-hidden="true" />}
                  label="შეტყობინება"
                  hint={`დარჩა ${broadcastsRemaining}/${broadcastsPerDay}`}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Drawer
        open={sheet === 'ticket'}
        onClose={close}
        title="ახალი ბილეთი"
        description="დაიწყეთ ბილეთის ფოტოთი."
      >
        <PostBetForm
          sports={sports}
          defaultSportId={defaultSportId}
          onPosted={close}
        />
      </Drawer>

      <Drawer
        open={sheet === 'note'}
        onClose={close}
        title="სტატუსი"
        description="ჩანს თქვენს ფიდზე. შეტყობინება არავის მიდის."
      >
        <NoteForm />
      </Drawer>

      <Drawer
        open={sheet === 'live'}
        onClose={close}
        title="ლაივის გამოცხადება"
        description="გამომწერებსა და შემნახველებს მიუვათ შეტყობინება."
      >
        <LiveForm />
      </Drawer>

      <Drawer
        open={sheet === 'broadcast'}
        onClose={close}
        title="შეტყობინება"
        description={`დღეს დარჩა ${broadcastsRemaining} ${broadcastsPerDay}-დან.`}
      >
        <BroadcastForm
          audienceSize={audienceSize}
          remaining={broadcastsRemaining}
          perDay={broadcastsPerDay}
        />
      </Drawer>
    </>
  );
}

function MenuItem({
  onSelect,
  icon,
  label,
  hint,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full min-h-11 items-center gap-3 px-3.5 text-left text-sm text-ink transition-colors hover:bg-elevated"
    >
      <span className="text-ink-faint">{icon}</span>
      <span className="min-w-0 flex-1">
        {label}
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}
