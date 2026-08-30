'use client';

import { useActionState, useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Repeat2 } from 'lucide-react';
import { postBetAction } from '@/actions/analyst';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Post a bet, screenshot first.
 *
 * The slip IS the bet: an analyst arriving here already has it in their camera
 * roll, and everything else on this form exists only because an image cannot
 * tell the record what to compute. So the upload is the first field and the
 * largest - a tap target that shows the picture back - and the numbers follow
 * in one tight grid rather than as a column of equals.
 *
 * A name and a comment are optional. Requiring a title made every analyst
 * write a sentence describing a picture that was already open in front of the
 * reader; when it is left blank the server derives one from the sport and the
 * odds.
 *
 * The preview is a local object URL: nothing uploads until submit, so changing
 * your mind leaves nothing behind on the server.
 */
export function PostBetForm({
  sports,
  onPosted,
}: {
  sports: { value: string; label: string }[];
  /** Lets the drawer close itself once the bet is up. */
  onPosted?: () => void;
}) {
  const [state, action, pending] = useActionState(postBetAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [visibility, setVisibility] = useState('PREMIUM');
  const [price, setPrice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  const screenshotError = errorFor('screenshot') ?? errorFor('screenshotPath');

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="ბილეთი გამოქვეყნდა">
          ჩანაწერი დაემატა თქვენს საჯარო ისტორიას. მატჩის დასრულების შემდეგ
          მონიშნეთ დასრულებულად.
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              if (onPosted) onPosted();
              window.location.reload();
            }}
          >
            დასრულება
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            კიდევ ერთის დამატება
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-5"
      // Let an explicit success reset through; block React 19's automatic
      // reset when the action failed, so an error never wipes the draft.
      onReset={(event) => {
        if (state && !state.ok) event.preventDefault();
      }}
    >
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      {/* ----------------------------------------------------------------- */}
      {/* 1. The slip                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <input
          ref={fileRef}
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />

        {preview ? (
          <div className="space-y-2">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-canvas">
              {/* Local object URL, so next/image optimisation is bypassed. */}
              <Image
                src={preview}
                alt="ატვირთული კუპონის გადახედვა"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <Repeat2 className="size-4" aria-hidden="true" />
              სხვა ფოტოს არჩევა
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-describedby="screenshot-help"
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
              screenshotError
                ? 'border-loss/60 bg-loss/5'
                : 'border-line-strong bg-canvas hover:border-accent hover:bg-elevated'
            }`}
          >
            <ImagePlus className="size-8 text-ink-faint" aria-hidden="true" />
            <span className="text-base font-semibold text-ink">
              კუპონის სკრინშოტი
            </span>
            <span className="text-sm text-ink-muted">
              დააჭირეთ ფოტოს ასარჩევად
            </span>
          </button>
        )}

        {screenshotError ? (
          <p className="mt-1.5 text-xs text-loss" role="alert">
            {screenshotError}
          </p>
        ) : (
          <p id="screenshot-help" className="mt-1.5 text-xs text-ink-muted">
            JPG, PNG, HEIC ან WebP, მაქსიმუმ 12MB.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. What the record needs                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
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
            placeholder="1.85"
            required
            error={Boolean(errorFor('odds'))}
          />
        </Field>

        <Field
          label="ერთეული"
          htmlFor="stakeUnits"
          required
          error={errorFor('stakeUnits')}
        >
          <Input
            id="stakeUnits"
            name="stakeUnits"
            type="number"
            step="0.25"
            min="0.25"
            max="10"
            defaultValue="1"
            inputMode="decimal"
            required
            error={Boolean(errorFor('stakeUnits'))}
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

        <Field
          label="პირველი მატჩის დაწყება"
          htmlFor="eventAt"
          required
          error={errorFor('eventAt')}
        >
          <Input
            id="eventAt"
            name="eventAt"
            type="datetime-local"
            required
            error={Boolean(errorFor('eventAt'))}
          />
        </Field>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. Free or for sale                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4 rounded-card border border-line bg-canvas p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            ხელმისაწვდომობა
          </legend>
          {/* Two states, so a segmented control rather than a dropdown: the
              choice changes what the rest of this box asks for. */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'PUBLIC', label: 'უფასო' },
              { value: 'PREMIUM', label: 'ფასიანი' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-4 text-sm font-medium transition-colors ${
                  visibility === option.value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={(event) => setVisibility(event.target.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {visibility !== 'PUBLIC' ? (
          <Field
            label="ბილეთის ფასი (₾)"
            htmlFor="price"
            required
            error={errorFor('price')}
            hint="მყიდველი გამოწერის გარეშე იხდის; თქვენ 85% გერიცხებათ."
          >
            <div className="space-y-2">
              <Input
                id="price"
                name="price"
                type="number"
                min="1"
                max="500"
                step="0.5"
                inputMode="decimal"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                error={Boolean(errorFor('price'))}
              />
              {/* One-tap prices: what most tickets actually cost. */}
              <div className="flex flex-wrap gap-1.5">
                {['5', '10', '15', '20'].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setPrice(quick)}
                    className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                      price === quick
                        ? 'border-accent text-accent'
                        : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
                    }`}
                  >
                    {quick} ₾
                  </button>
                ))}
              </div>
            </div>
          </Field>
        ) : null}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 4. Optional words                                                  */}
      {/* ----------------------------------------------------------------- */}
      <details className="group rounded-card border border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-ink marker:content-none">
          სახელი და კომენტარი
          <span className="text-xs font-normal text-ink-faint">
            არასავალდებულო
          </span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <Field
            label="ბილეთის სახელი"
            htmlFor="titleKa"
            error={errorFor('titleKa')}
            hint="ცარიელი თუ დატოვეთ, ავტომატურად შეივსება სპორტითა და კოეფიციენტით."
          >
            <Input
              id="titleKa"
              name="titleKa"
              maxLength={160}
              placeholder="მაგ: დინამო vs საბურთალო, ჯამური 2.5+"
              error={Boolean(errorFor('titleKa'))}
            />
          </Field>

          <Field
            label="კომენტარი"
            htmlFor="descriptionKa"
            error={errorFor('descriptionKa')}
            hint="რატომ ფიქრობთ ასე. მყიდველები სრულად ხედავენ."
          >
            <Textarea
              id="descriptionKa"
              name="descriptionKa"
              rows={4}
              maxLength={4000}
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap gap-3">
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
