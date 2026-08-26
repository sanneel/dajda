'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { applyAsAnalystAction } from '@/actions/analyst';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export type SportOption = { id: string; nameKa: string };

export function AnalystApplyForm({ sports }: { sports: SportOption[] }) {
  const [state, action, pending] = useActionState(applyAsAnalystAction, null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  const errorFor = (field: string) => fieldErrors?.[field]?.[0];

  if (state?.ok) {
    return (
      <Alert tone="success" title="განაცხადი მიღებულია">
        განაცხადს განიხილავს ადმინისტრაცია. პასუხს მიიღებთ ელფოსტაზე.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="სახელი" htmlFor="firstName" required error={errorFor('firstName')}>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            error={Boolean(errorFor('firstName'))}
          />
        </Field>

        <Field label="გვარი" htmlFor="lastName" required error={errorFor('lastName')}>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            error={Boolean(errorFor('lastName'))}
          />
        </Field>
      </div>

      <Field
        label="საჯარო სახელი"
        htmlFor="displayName"
        required
        hint="ეს სახელი გამოჩნდება თქვენს პროფილზე. შეიძლება არ ემთხვეოდეს სახელსა და გვარს."
        error={errorFor('displayName')}
      >
        <Input
          id="displayName"
          name="displayName"
          required
          error={Boolean(errorFor('displayName'))}
        />
      </Field>

      <Field
        label="ვისი რეკომენდაციით ან საიდან მოხვდით პლატფორმაზე"
        htmlFor="referralSource"
        required
        hint="მაგალითად: მეგობრის რეკომენდაცია, სოციალური ქსელი, სხვა ავტორი."
        error={errorFor('referralSource')}
      >
        <Input
          id="referralSource"
          name="referralSource"
          required
          error={Boolean(errorFor('referralSource'))}
        />
      </Field>

      <Field
        label="ძირითადი მიმართულება"
        htmlFor="primarySportId"
        required
        error={errorFor('primarySportId')}
      >
        <Select
          id="primarySportId"
          name="primarySportId"
          required
          defaultValue=""
          error={Boolean(errorFor('primarySportId'))}
        >
          <option value="" disabled>
            აირჩიეთ სპორტი
          </option>
          {sports.map((sport) => (
            <option key={sport.id} value={sport.id}>
              {sport.nameKa}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="მოკლე წარწერა"
        htmlFor="headline"
        hint="ერთი ხაზი პროფილის თავში. არასავალდებულო."
        error={errorFor('headline')}
      >
        <Input id="headline" name="headline" error={Boolean(errorFor('headline'))} />
      </Field>

      <Field
        label="აღწერა"
        htmlFor="bio"
        required
        hint="მოგვიყევით თქვენი გამოცდილების შესახებ. მინიმუმ 40 სიმბოლო."
        error={errorFor('bio')}
      >
        <Textarea
          id="bio"
          name="bio"
          rows={5}
          required
          error={Boolean(errorFor('bio'))}
        />
      </Field>

      <Field
        label="პირადობის დამადასტურებელი დოკუმენტი"
        htmlFor="identityDocument"
        required
        hint="პირადობის მოწმობის ან პასპორტის ფოტო. დოკუმენტს ხედავს მხოლოდ ადმინისტრაცია და საჯაროდ არასოდეს ქვეყნდება."
        error={errorFor('identityDocument')}
      >
        <input
          id="identityDocument"
          name="identityDocument"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
      </Field>

      <Checkbox
        id="acceptTerms"
        name="acceptTerms"
        error={errorFor('acceptTerms')}
        label={
          <>
            ვეთანხმები{' '}
            <Link href="/legal#terms" className="text-accent hover:underline">
              წესებსა და პირობებს
            </Link>{' '}
            და ვადასტურებ, რომ მოწოდებული ინფორმაცია სწორია.
          </>
        }
      />

      <Button type="submit" disabled={pending}>
        {pending ? 'იგზავნება…' : 'განაცხადის გაგზავნა'}
      </Button>
    </form>
  );
}
