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
 * The request is a two-field form, but one of the fields is a card number,
 * and an always-open card-number input on the earnings page read as a
 * demand rather than an option. The page now states what can be taken out
 * and when; the form appears only when the author decides to take it.
 *
 * Outside the window there is nothing to open, so the button is replaced
 * by the same notice the form used to show.
 */
export function WithdrawDialog({
  maxGel,
  minGel,
  windowOpen,
}: {
  maxGel: number;
  minGel: number;
  windowOpen: boolean;
}) {
  const [open, setOpen] = useState(false);

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
