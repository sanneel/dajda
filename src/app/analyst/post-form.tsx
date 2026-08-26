'use client';

import { useActionState, useRef, useState } from 'react';
import Image from 'next/image';
import { postBetAction } from '@/actions/analyst';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Post a bet.
 *
 * The screenshot is the first field and the only required one beyond a title,
 * because it is what the bet actually is. Everything else exists so the public
 * record can compute ROI, which an image cannot supply.
 *
 * The preview is read locally with an object URL: no upload happens until the
 * form is submitted, so an author can change their mind without leaving a file
 * on the server.
 */
export function PostBetForm({
  sports,
}: {
  sports: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(postBetAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="ფსონი გამოქვეყნდა">
          ჩანაწერი დაემატა თქვენს საჯარო ისტორიას. მატჩის დასრულების შემდეგ
          მონიშნეთ დასრულებულად.
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
          კიდევ ერთის დამატება
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-5">
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <Field
        label="ფსონის სკრინშოტი"
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

      <div className="grid gap-5 sm:grid-cols-3">
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

        <Field label="ერთეული" htmlFor="stakeUnits" error={errorFor('stakeUnits')}>
          <Input
            id="stakeUnits"
            name="stakeUnits"
            type="number"
            step="0.25"
            min="0.25"
            max="10"
            defaultValue="1"
            inputMode="decimal"
          />
        </Field>

        <Field label="სპორტი" htmlFor="sportId" required error={errorFor('sportId')}>
          <Select id="sportId" name="sportId" required>
            {sports.map((sport) => (
              <option key={sport.value} value={sport.value}>
                {sport.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="ხელმისაწვდომობა"
          htmlFor="visibility"
          error={errorFor('visibility')}
          hint="უფასო ჩანს ყველასთვის. დანარჩენი მოითხოვს გამოწერას."
        >
          <Select id="visibility" name="visibility" defaultValue="PREMIUM">
            <option value="PUBLIC">უფასო</option>
            <option value="PREMIUM">Premium</option>
            <option value="VIP">VIP</option>
          </Select>
        </Field>

        <Field
          label="პირველი პოზიციის დაწყება"
          htmlFor="eventAt"
          error={errorFor('eventAt')}
          hint="როდის იწყება ბილეთის პირველი მატჩი. ფასიან ბილეთზე მყიდველი ამას შეძენამდე ხედავს."
        >
          <Input id="eventAt" name="eventAt" type="datetime-local" />
        </Field>
      </div>

      <Field
        label="აღწერა"
        htmlFor="descriptionKa"
        error={errorFor('descriptionKa')}
        hint="არასავალდებულო. გამომწერები ხედავენ სრულად."
      >
        <Textarea id="descriptionKa" name="descriptionKa" rows={5} maxLength={4000} />
      </Field>

      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'ქვეყნდება…' : 'გამოქვეყნება'}
        </Button>
        <Button
          type="submit"
          name="publishNow"
          value="off"
          variant="secondary"
          size="lg"
          disabled={pending}
        >
          მონახაზად შენახვა
        </Button>
      </div>
    </form>
  );
}
