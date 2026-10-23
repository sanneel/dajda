'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PostBetForm } from '@/app/analyst/post-form';

/**
 * "Add ticket": the post form, in a drawer, wherever an analyst is standing.
 *
 * Rendered only for an approved analyst: the server decides, and a reader
 * never receives it at all. The floating variant sits in the bottom right
 * corner of every page, above the phone tab bar, so posting is one tap away
 * from anywhere. The workspace has its own action bar, so it is left out there.
 */
export function AddTicketButton({
  sports,
  canPostSubscription,
  label = 'ბილეთის დამატება',
  floating = false,
}: {
  sports: { value: string; label: string }[];
  /** Whether this author has a subscription to post subscription tickets into. */
  canPostSubscription: boolean;
  label?: string;
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (floating && pathname === '/analyst') return null;

  return (
    <>
      {floating ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-ink text-on-ink shadow-lg transition-colors hover:bg-accent active:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:right-8 lg:bottom-8 lg:h-14 lg:w-auto lg:px-6"
        >
          <Plus className="size-6" aria-hidden="true" />
          <span className="hidden text-base font-semibold lg:inline">
            {label}
          </span>
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {label}
        </Button>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="ახალი ბილეთი"
        description="დაიწყეთ ბილეთის ფოტოთი."
      >
        <PostBetForm
          sports={sports}
          canPostSubscription={canPostSubscription}
          onPosted={() => setOpen(false)}
        />
      </Drawer>
    </>
  );
}
