'use client';

import { useActionState } from 'react';
import { updateProfileAction } from '@/actions/account';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { NAME_LOCKED_KA } from '@/lib/account/identity';

export function ProfileForm({
  defaultName,
  email,
  nameLocked = false,
}: {
  defaultName: string;
  email: string;
  /** An analyst's name was verified against a document; see lib/account/identity. */
  nameLocked?: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form
      action={action}
      className="space-y-4"
      noValidate
      // React 19 resets the form after every action; canceling the reset
      // keeps what was typed (see register-form for the full story).
      onReset={(event) => event.preventDefault()}
    >
      {state?.ok ? <Alert tone="success">მონაცემები შენახულია.</Alert> : null}
      {state && !state.ok && !fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      {nameLocked ? (
        <Field label="სახელი" htmlFor="name-readonly" hint={NAME_LOCKED_KA}>
          <Input id="name-readonly" defaultValue={defaultName} disabled readOnly />
        </Field>
      ) : (
        <Field label="სახელი" htmlFor="name" required error={fieldErrors?.name?.[0]}>
          <Input
            id="name"
            name="name"
            defaultValue={defaultName}
            required
            error={Boolean(fieldErrors?.name?.[0])}
          />
        </Field>
      )}

      <Field
        label="ელფოსტა"
        htmlFor="email-readonly"
        hint="ელფოსტის შეცვლა ამჟამად შესაძლებელია მხოლოდ მხარდაჭერის მეშვეობით."
      >
        <Input id="email-readonly" defaultValue={email} disabled readOnly />
      </Field>

      {nameLocked ? null : (
        <Button type="submit" disabled={pending}>
          {pending ? 'ინახება…' : 'შენახვა'}
        </Button>
      )}
    </form>
  );
}
