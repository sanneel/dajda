'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { FileImage, ImagePlus, Plus, X } from 'lucide-react';
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
  defaultSportId,
  onPosted,
}: {
  sports: { value: string; label: string }[];
  /** The author's primary sport, so the select opens on what they cover. */
  defaultSportId?: string;
  /** Lets the drawer close itself once the bet is up. */
  onPosted?: () => void;
}) {
  const [state, action, pending] = useActionState(postBetAction, null);
  /*
   * Files are held here, not left to the input, because a second pick has to
   * ADD to the set rather than replace it - which is what an <input multiple>
   * does on its own. The input is re-populated from this list through a
   * DataTransfer before submit, so the form still posts plain files.
   */
  const [files, setFiles] = useState<File[]>([]);
  /*
   * Checked HERE on submit, not with `required` on the hidden input. A
   * required control the browser cannot focus (this one is sr-only) makes
   * the browser refuse the submit and say nothing - the author pressed
   * "publish" and watched nothing happen. Now the empty slot is marked and
   * scrolled into view instead.
   */
  const [missingSlip, setMissingSlip] = useState(false);
  // Subscription is the default: it is what an author's page is FOR.
  const [visibility, setVisibility] = useState('VIP');
  const [price, setPrice] = useState('');
  const pickerRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const MAX_SLIPS = 6;

  /** Mirror `files` into the real form input the action reads. */
  const syncField = (next: File[]) => {
    setFiles(next);
    if (next.length > 0) setMissingSlip(false);
    const transfer = new DataTransfer();
    for (const file of next) transfer.items.add(file);
    if (fieldRef.current) fieldRef.current.files = transfer.files;
  };

  /*
   * One object URL per file, made once per selection and released when the
   * selection changes or the form unmounts. Creating them inline in render
   * minted a fresh blob URL on every keystroke elsewhere on the form.
   *
   * HEIC/HEIF is accepted (phones produce it, the server re-encodes it) but
   * no browser draws it in an <img>, so those get a file card rather than an
   * empty frame that looks like a failed upload.
   */
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        undrawable:
          /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name),
      })),
    [files],
  );
  useEffect(
    () => () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    },
    [previews],
  );

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  const screenshotError = missingSlip
    ? 'ატვირთეთ ბილეთის სკრინშოტი.'
    : (errorFor('screenshot') ?? errorFor('screenshotPath'));

  if (state?.ok) {
    return (
      <div className="space-y-4">
        {state.data.published ? (
          <Alert tone="success" title="ბილეთი გამოქვეყნდა">
            ჩანაწერი დაემატა თქვენს საჯარო ისტორიას. მატჩის დასრულების შემდეგ
            მონიშნეთ დასრულებულად.
          </Alert>
        ) : (
          <Alert tone="success" title="მონახაზი შენახულია">
            ბილეთი ჯერ არ ჩანს საჯაროდ და ჩანაწერში არ ითვლება. გამოაქვეყნეთ
            „მონახაზები“-დან, როცა მზად იქნებით.
          </Alert>
        )}
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
      onSubmit={(event) => {
        if (files.length > 0) return;
        event.preventDefault();
        setMissingSlip(true);
        dropRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        dropRef.current?.focus();
      }}
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
      {/* 1. The slips                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div>
        {/* The real field the action reads. Kept in sync from `files`. */}
        <input
          ref={fieldRef}
          id="screenshot"
          name="screenshot"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          onChange={() => {}}
        />
        {/* The picker the buttons open. Its result is APPENDED, so picking a
            second time adds a leg rather than discarding the first. */}
        <input
          ref={pickerRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > 0) {
              syncField([...files, ...picked].slice(0, MAX_SLIPS));
            }
            // Let the same file be picked again after a removal.
            event.target.value = '';
          }}
        />

        {files.length === 0 ? (
          <button
            ref={dropRef}
            type="button"
            onClick={() => pickerRef.current?.click()}
            aria-describedby="screenshot-help"
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
              screenshotError
                ? 'border-loss/60 bg-loss/5'
                : 'border-line-strong bg-canvas hover:border-accent hover:bg-elevated'
            }`}
          >
            <ImagePlus className="size-8 text-ink-faint" aria-hidden="true" />
            <span className="text-base font-semibold text-ink">
              ბილეთის სკრინშოტი
            </span>
            <span className="text-sm text-ink-muted">
              დააჭირეთ ფოტოს ასარჩევად, შეიძლება რამდენიმე
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {previews.map((preview, index) => (
              <div
                key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
                className="relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-canvas"
              >
                {preview.undrawable ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center">
                    <FileImage
                      className="size-7 text-ink-faint"
                      aria-hidden="true"
                    />
                    <span className="line-clamp-1 text-xs text-ink-muted">
                      {preview.file.name}
                    </span>
                    <span className="text-xs text-ink-faint">
                      HEIC მიღებულია, ბრაუზერი მას არ აჩვენებს
                    </span>
                  </div>
                ) : (
                  /*
                   * A plain <img> on purpose. next/image exists to optimise
                   * remote sources; a local blob URL gains nothing from it
                   * and, with `fill`, was drawing an empty frame.
                   */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={`ბილეთის ფოტო ${index + 1}`}
                    className="absolute inset-0 size-full object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() =>
                    syncField(files.filter((_, at) => at !== index))
                  }
                  aria-label={`ფოტო ${index + 1} წაშლა`}
                  className="absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-full bg-ink/70 text-on-ink transition-opacity hover:opacity-80"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
                {index === 0 ? (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-xs text-on-ink">
                    მთავარი
                  </span>
                ) : null}
              </div>
            ))}

            {files.length < MAX_SLIPS ? (
              <button
                type="button"
                onClick={() => pickerRef.current?.click()}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line-strong bg-canvas text-ink-muted transition-colors hover:border-accent hover:text-ink"
              >
                <Plus className="size-6" aria-hidden="true" />
                <span className="text-sm font-medium">ფოტოს დამატება</span>
              </button>
            ) : null}
          </div>
        )}

        {screenshotError ? (
          <p className="mt-1.5 text-xs text-loss" role="alert">
            {screenshotError}
          </p>
        ) : (
          <p id="screenshot-help" className="mt-1.5 text-xs text-ink-muted">
            JPG, PNG, HEIC ან WebP. მაქსიმუმ {MAX_SLIPS} ფოტო, თითო 12MB-მდე.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. How it is reached                                               */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4 rounded-card border border-line bg-canvas p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            ხელმისაწვდომობა
          </legend>
          {/*
           * Three genuinely different products, not a price switch:
           *   უფასო    - anyone reads it.
           *   ფასიანი  - sold on its own, at a price this author sets, and
           *              included for their subscribers.
           *   გამოწერა - subscribers only; not for sale separately, so it
           *              carries no price at all.
           * They used to collapse into two because ფასიანი and გამოწერა were
           * the same form with the same fields.
           */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'PUBLIC', label: 'უფასო' },
              { value: 'PREMIUM', label: 'ფასიანი' },
              { value: 'VIP', label: 'გამოწერა' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-sm font-medium transition-colors ${
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

          <p className="mt-2 text-xs text-ink-muted">
            {visibility === 'PUBLIC'
              ? 'ხედავს ყველა, ვინც შესულია.'
              : visibility === 'PREMIUM'
                ? 'იყიდება ცალკე, თქვენს ფასად. თქვენი გამომწერებისთვის ისედაც ღიაა.'
                : 'მხოლოდ თქვენი გამომწერებისთვის. ცალკე არ იყიდება, ამიტომ ფასი არ სჭირდება.'}
          </p>
        </fieldset>

        {visibility === 'PREMIUM' ? (
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
              {/* One-tap prices; the field takes any amount up to 500. */}
              <div className="flex flex-wrap gap-1.5">
                {['10', '20', '30', '50', '100'].map((quick) => (
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
      {/* 3. What the record needs                                           */}
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

        <Field label="სპორტი" htmlFor="sportId" required error={errorFor('sportId')}>
          {/* Opens on the author's own sport; the list is alphabetical, and
              the first letter of the alphabet is nobody's default. */}
          <Select
            id="sportId"
            name="sportId"
            required
            defaultValue={defaultSportId}
          >
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
          hint="თბილისის დროით."
        >
          <Input
            id="eventAt"
            name="eventAt"
            type="datetime-local"
            required
            error={Boolean(errorFor('eventAt'))}
          />
        </Field>

        <Field
          label="ბოლო მატჩის დაწყება"
          htmlFor="eventEndAt"
          error={errorFor('eventEndAt')}
          hint="მრავალმატჩიან ბილეთზე. ერთმატჩიანზე დატოვეთ ცარიელი."
        >
          <Input
            id="eventEndAt"
            name="eventEndAt"
            type="datetime-local"
            error={Boolean(errorFor('eventEndAt'))}
          />
        </Field>
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

      {/*
       * The click runs BEFORE the browser's own required-field check, so an
       * empty slip slot turns red at the same moment the odds field gets its
       * bubble - every missing thing is marked at once, not one per attempt.
       */}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          onClick={() => {
            if (files.length === 0) setMissingSlip(true);
          }}
        >
          {pending ? 'ქვეყნდება…' : 'გამოქვეყნება'}
        </Button>
        <Button
          type="submit"
          name="publishNow"
          value="off"
          variant="secondary"
          size="lg"
          disabled={pending}
          onClick={() => {
            if (files.length === 0) setMissingSlip(true);
          }}
        >
          მონახაზად შენახვა
        </Button>
      </div>
    </form>
  );
}
