'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PostBetForm } from '@/app/analyst/post-form';

/**
 * "Add ticket": the post form, in a drawer, wherever an analyst is standing.
 *
 * Posting used to live in one place - an inline form on the free feed, open to
 * any signed-in visitor - which was both too narrow and too wide. Too narrow
 * because an analyst reading the paid feed had to navigate away to post to it;
 * too wide because the record is a record of ANALYSTS, and a community upload
 * sat in the same list as one.
 *
 * So it is a component now, rendered by the pages that make sense (an author's
 * own profile, the free feed, the paid feed) and only ever for an approved
 * analyst - the server decides, and a reader never receives it at all.
 */
export function AddTicketButton({
  sports,
  label = 'ბილეთის დამატება',
}: {
  sports: { value: string; label: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="ახალი ბილეთი"
        description="დაიწყეთ ბილეთის ფოტოთი."
      >
        <PostBetForm sports={sports} onPosted={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
