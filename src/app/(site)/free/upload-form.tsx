'use client';

import { useActionState, useRef, useState } from 'react';
import Image from 'next/image';
import { postFreeTicketAction } from '@/actions/free-tickets';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Upload a free ticket.
 *
 * Four fields, all on one screen: the slip, a title, the odds and the sport.
 * Anything else an analyst fills in exists to feed a public record, and a free
 * ticket does not have one, so asking for it here would be asking for data
 * nothing will ever read.
 *
 * The preview is a local object URL. Nothing is uploaded until submit, so
 * changing your mind leaves no file on the server.
 */
export function FreeTicketForm({
  sports,
}: {
  sports: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(postFreeTicketAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="პროგნოზი აიტვირთა">
          თქვენი პროგნოზი ჩანს სიაში. ის უფასოა და არავის სტატისტიკაში არ ითვლება.
        </Alert>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setPreview(null);
            formRef.current?.reset();
            // A fresh mount clears the action state.
            window.location.reload();
          }}
        >
          კიდევ ერთის ატვირთვა
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-5"
      // Let the explicit success reset through; block React 19's automatic
      // reset when the action failed, so an error never wipes the draft.
      onReset={(event) => {
        if (state && !state.ok) event.preventDefault();
      }}
    >
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <Field
        label="პროგნოზის სკრინშოტი"
        htmlFor="screenshot"
        required
        error={errorFor('screenshot') ?? errorFor('screenshotPath')}
        hint="კუპონის ფოტო. JPG, PNG ან WebP, მაქსიმუმ 12MB."
      >
        <input
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
          className="w-full rounded-control border border-line bg-canvas px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
      </Field>

      {preview ? (
        <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-card border border-line bg-canvas">
          {/* Local object URL, so next/image optimisation is bypassed. */}
          <Image
            src={preview}
            alt="ატვირთული სკრინშოტის გადახედვა"
            fill
            unoptimized
            className="object-contain"
          />
        </div>
      ) : null}

      <Field
        label="სათაური"
        htmlFor="titleKa"
        required
        error={errorFor('titleKa')}
        hint="მაგ: დინამო თბილისი vs საბურთალო, ჯამური 2.5-ზე მეტი"
      >
        <Input id="titleKa" name="titleKa" required maxLength={160} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="კოეფიციენტი"
          htmlFor="odds"
          required
          error={errorFor('odds')}
        >
          <Input
            id="odds"
            name="odds"
            type="number"
            step="0.01"
            min="1.01"
            inputMode="decimal"
            required
          />
        </Field>

        <Field
          label="სპორტი"
          htmlFor="sportId"
          required
          error={errorFor('sportId')}
        >
          <Select id="sportId" name="sportId" required>
            {sports.map((sport) => (
              <option key={sport.value} value={sport.value}>
                {sport.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="აღწერა"
        htmlFor="descriptionKa"
        error={errorFor('descriptionKa')}
        hint="არასავალდებულო."
      >
        <Textarea
          id="descriptionKa"
          name="descriptionKa"
          rows={4}
          maxLength={2000}
        />
      </Field>

      <div className="border-t border-line pt-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'იტვირთება…' : 'ატვირთვა'}
        </Button>
      </div>
    </form>
  );
}
