import Link from 'next/link';

/**
 * Filter bar for the bet browser.
 *
 * A plain GET form rather than client state: the resulting URL is the whole
 * query, so an admin can bookmark "everything Giorgi has waiting on review" or
 * paste it to someone else, and the back button behaves.
 */
export type Option = { value: string; label: string };

export function PredictionFilters({
  analysts,
  sports,
  current,
  total,
}: {
  analysts: Option[];
  sports: Option[];
  current: {
    analyst?: string;
    status?: string;
    sport?: string;
    review?: string;
    q?: string;
  };
  total: number;
}) {
  const hasFilter = Object.values(current).some(Boolean);

  return (
    <form
      method="get"
      action="/admin/predictions"
      className="rounded-card border border-line bg-elevated p-4"
      aria-label="ფსონების ფილტრი"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="ძებნა" htmlFor="f-q">
          <input
            id="f-q"
            name="q"
            defaultValue={current.q ?? ''}
            placeholder="სათაური"
            className="min-h-11 w-full rounded-control border border-line bg-canvas px-3 text-sm text-ink"
          />
        </Field>

        <Field label="ავტორი" htmlFor="f-analyst">
          <Select
            id="f-analyst"
            name="analyst"
            value={current.analyst}
            all="ყველა ავტორი"
            options={analysts}
          />
        </Field>

        <Field label="შედეგი" htmlFor="f-status">
          <Select
            id="f-status"
            name="status"
            value={current.status}
            all="ყველა შედეგი"
            options={[
              { value: 'PENDING', label: 'მოლოდინში' },
              { value: 'WON', label: 'დაჯდა' },
              { value: 'LOST', label: 'ვერ დაჯდა' },
              { value: 'VOID', label: 'ბათილი' },
              { value: 'PUSH', label: 'დაბრუნებული' },
            ]}
          />
        </Field>

        <Field label="სპორტი" htmlFor="f-sport">
          <Select
            id="f-sport"
            name="sport"
            value={current.sport}
            all="ყველა სპორტი"
            options={sports}
          />
        </Field>

        <Field label="განხილვა" htmlFor="f-review">
          <Select
            id="f-review"
            name="review"
            value={current.review}
            all="ყველა"
            options={[{ value: 'awaiting', label: 'ელოდება განხილვას' }]}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button
          type="submit"
          className="min-h-11 rounded-control bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-dim"
        >
          ფილტრი
        </button>

        {hasFilter ? (
          <Link
            href="/admin/predictions"
            className="min-h-11 self-center text-sm text-ink-muted hover:text-ink"
          >
            გასუფთავება
          </Link>
        ) : null}

        <span className="ml-auto text-sm text-ink-muted">
          ნაპოვნია <span className="tabular text-ink">{total}</span>
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="rule-label mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  id,
  name,
  value,
  all,
  options,
}: {
  id: string;
  name: string;
  value?: string;
  all: string;
  options: Option[];
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={value ?? ''}
      className="min-h-11 w-full rounded-control border border-line bg-canvas px-3 text-sm text-ink"
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
