'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/format';
import { WithdrawForm } from './withdraw-form';

/**
 * Withdrawal, behind a button.
 *
 * The request is a two-field form, but one of the fields is a bank account,
 * and an always-open account-number input on the earnings page read as a
 * demand rather than an option. The page now states what can be taken out
 * and when; the form appears only when the author decides to take it.
 *
 * Outside the window there is nothing to open, so the button is replaced
 * by the same notice the form used to show. A window an administrator has
 * held shut says so instead: waiting for the last day of the month would not
 * help, and telling somebody to do that is worse than telling them nothing.
 */
export function WithdrawDialog({
  maxGel,
  minGel,
  windowOpen,
  held = false,
  heldNote = null,
}: {
  maxGel: number;
  minGel: number;
  windowOpen: boolean;
  /** An administrator has closed this author's window, whatever the date. */
  held?: boolean;
  heldNote?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (held) {
    return (
      <Alert tone="warning" title="გატანა დროებით შეჩერებულია">
        {heldNote
          ? `${heldNote} დეტალებისთვის დაგვიკავშირდით.`
          : 'ადმინისტრაციამ დროებით შეაჩერა გატანა. დეტალებისთვის დაგვიკავშირდით.'}
      </Alert>
    );
  }

  if (!windowOpen) {
    return (
      <Alert tone="info" title="გატანა ჯერ დახურულია">
        თანხის გატანა ხელმისაწვდომია ყოველი თვის ბოლო დღეს.
      </Alert>
    );
  }

  const canWithdraw = maxGel >= minGel;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">გასატანი ნაშთი</p>
          <p className="font-display text-2xl text-ink tabular">
            {formatMoney(Math.round(maxGel * 100), 'GEL')}
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)} disabled={!canWithdraw}>
          გატანა
        </Button>
      </div>
      {!canWithdraw ? (
        <p className="mt-3 text-xs text-ink-faint">
          გატანისთვის ნაშთი მინიმუმ {minGel} ლარი უნდა იყოს.
        </p>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title="თანხის გატანა">
        <WithdrawForm maxGel={maxGel} minGel={minGel} windowOpen />
      </Modal>
    </>
  );
}
