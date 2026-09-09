'use client';

import { useActionState } from 'react';
import { requestWithdrawalAction } from '@/actions/payouts';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function WithdrawForm({
  maxGel,
  minGel,
  windowOpen,
}: {
  maxGel: number;
  minGel: number;
  windowOpen: boolean;
}) {
  const [state, action, pending] = useActionState(
    requestWithdrawalAction,
    null,
  );

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;
  const errorFor = (field: string) => fieldErrors?.[field]?.[0];

  if (state?.ok) {
    return (
      <Alert tone="success" title="მოთხოვნა მიღებულია">
        თანხა გამოკლებულია ნაშთიდან და მოთხოვნა გადაეცა ადმინისტრაციას.
        დამუშავების შემდეგ მიიღებთ შეტყობინებას.
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

  return (
    <form action={action} className="space-y-4" noValidate>
      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <Field
        label="თანხა"
        htmlFor="amountGel"
        required
        hint={`მინიმუმი ${minGel} ლარი, მაქსიმუმი ${maxGel} ლარი.`}
        error={errorFor('amountGel')}
      >
        <Input
          id="amountGel"
          name="amountGel"
          type="number"
          inputMode="decimal"
          min={minGel}
          max={maxGel}
          step="0.01"
          required
          error={Boolean(errorFor('amountGel'))}
        />
      </Field>

      <Field
        label="IBAN"
        htmlFor="iban"
        required
        hint="თანხა ჩაირიცხება ამ ანგარიშზე. ნომერი ინახება დაშიფრული მხოლოდ მოთხოვნის დამუშავებამდე; შემდეგ რჩება მარტო დაფარული სახე."
        error={errorFor('iban')}
      >
        <Input
          id="iban"
          name="iban"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="GE95TB0000000123456789"
          required
          error={Boolean(errorFor('iban'))}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'იგზავნება…' : 'გატანის მოთხოვნა'}
      </Button>

      <p className="text-xs text-ink-faint">
        ჩარიცხვა ქართულ საბანკო ანგარიშზე, ლარით.
      </p>
    </form>
  );
}
