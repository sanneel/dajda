'use client';

import { useActionState, useState } from 'react';
import { topUpBalanceAction } from '@/actions/balance';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { PaymentMarks } from '@/components/payment-marks';

/*
 * The amounts most people actually type. The last one is the provider's
 * per-transaction ceiling, so nothing here can be refused for its size.
 */
const PRESETS_GEL = [10, 20, 50, 100, 500] as const;
const MAX_GEL = 500;

/**
 * Balance top-up, in a dialog.
 *
 * The form used to unfold inline under the balance figure, which made the
 * first card on the page the tallest thing on a phone and left the amount
 * field looking like a search box. A dialog gives the decision its own
 * frame: pick or type an amount, see what it buys and how it can be paid,
 * press one button. It closes into the provider's page, and the buyer comes
 * back to the dashboard with the payment banner.
 */
export function TopUpDialog() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>('20');
  const [state, action, pending] = useActionState(topUpBalanceAction, null);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_GEL;
  const selectedPreset = PRESETS_GEL.find((preset) => String(preset) === amount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
      >
        შევსება
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="ბალანსის შევსება">
        <form
          action={action}
          className="space-y-5"
          // React 19 resets the form after every action; cancelling the reset
          // keeps what was typed when the action returns an error.
          onReset={(event) => event.preventDefault()}
        >
          {state && !state.ok ? (
            <Alert tone="error">
              {state.error.fieldErrors?.amountGel?.[0] ?? state.error.message}
            </Alert>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">თანხა</legend>
            <div className="flex flex-wrap gap-2">
              {PRESETS_GEL.map((preset) => {
                const selected = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAmount(String(preset))}
                    className={`tabular inline-flex min-h-11 min-w-16 items-center justify-center rounded-pill border px-4 text-sm font-semibold transition-colors ${
                      selected
                        ? 'border-accent text-accent'
                        : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {preset} ₾
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field
            label="ან სხვა თანხა, ₾"
            htmlFor="topup-amount"
            hint={`1-დან ${MAX_GEL} ლარამდე ერთ შევსებაზე.`}
          >
            <Input
              id="topup-amount"
              name="amountGel"
              type="number"
              inputMode="decimal"
              min={1}
              max={MAX_GEL}
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="tabular"
            />
          </Field>

          <p className="text-xs leading-relaxed text-ink-faint">
            ბალანსი იხარჯება მხოლოდ გამოწერასა და ცალკეულ ბილეთებზე. ის არ
            არის საფსონე ანგარიში და ბარათზე უკან არ ბრუნდება. თუ ბალანსი
            გეგმის სრულ ფასს ფარავს, გამოწერა პირდაპირ ბალანსიდან გადაიხდება.
          </p>

          <Button type="submit" disabled={pending || !valid} className="w-full">
            {pending
              ? 'მუშავდება…'
              : valid
                ? `გადახდა · ${parsed.toFixed(2).replace(/\.00$/, '')} ₾`
                : 'გადახდა'}
          </Button>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-faint">
            <span>მიიღება:</span>
            <PaymentMarks withWallets />
          </div>
        </form>
      </Modal>
    </>
  );
}
