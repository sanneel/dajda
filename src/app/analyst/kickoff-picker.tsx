'use client';

import { useId, useMemo } from 'react';
import { Select } from '@/components/ui/field';

/**
 * When a match starts, without a datetime widget.
 *
 * The native datetime-local control asks for month, day, year, hour, minute
 * and AM/PM in a locale the author does not read, one segment at a time. A
 * kickoff is almost always today, tomorrow or the day after, in the evening,
 * so that is the shape of the control: three day chips (and a date field for
 * the rare later fixture), then an hour and a minute picked from lists.
 *
 * The value it hands back is the wall-clock string the schema already reads
 * ("YYYY-MM-DDTHH:mm", Tbilisi time), or an empty string until a day is
 * chosen. The parent owns the value and the hidden input, so the form can
 * check it on submit the way it checks the screenshot.
 */
export type Kickoff = { day: string; hour: string; minute: string };

export const EMPTY_KICKOFF: Kickoff = { day: '', hour: '20', minute: '00' };

export function kickoffValue(kickoff: Kickoff): string {
  return kickoff.day ? `${kickoff.day}T${kickoff.hour}:${kickoff.minute}` : '';
}

/** A local calendar date, `offset` days from today, as "YYYY-MM-DD". */
function localDay(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, '0'),
);
const MINUTES = ['00', '15', '30', '45'];

export function KickoffPicker({
  value,
  onChange,
  invalid = false,
  minDay,
}: {
  value: Kickoff;
  onChange: (next: Kickoff) => void;
  /** Marks the chips red when the form was submitted without a day. */
  invalid?: boolean;
  /** The earliest day that makes sense (the first match, for the last one). */
  minDay?: string;
}) {
  const id = useId();
  /*
   * Computed once per mount, not per render: the chip that says "today"
   * should not change identity under the author's finger at midnight.
   */
  const days = useMemo(
    () => [
      { label: 'დღეს', day: localDay(0) },
      { label: 'ხვალ', day: localDay(1) },
      { label: 'ზეგ', day: localDay(2) },
    ],
    [],
  );
  const chipDay = days.find((entry) => entry.day === value.day);
  const otherDay = value.day !== '' && !chipDay;

  const chip = (selected: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
      selected
        ? 'border-accent bg-accent/10 text-accent'
        : invalid
          ? 'border-loss/60 text-ink-muted hover:border-loss'
          : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {days.map((entry) => (
          <button
            key={entry.day}
            type="button"
            aria-pressed={value.day === entry.day}
            onClick={() => onChange({ ...value, day: entry.day })}
            className={chip(value.day === entry.day)}
          >
            {entry.label}
          </button>
        ))}
        {/*
         * The date field is a chip until it is needed, then a control. A
         * date input visible from the start read as "the real field" and
         * made the chips look like decoration.
         */}
        {otherDay ? (
          <input
            type="date"
            aria-label="თარიღი"
            value={value.day}
            min={minDay}
            onChange={(event) => onChange({ ...value, day: event.target.value })}
            className="min-h-11 rounded-full border border-accent bg-surface px-4 text-sm text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => onChange({ ...value, day: localDay(3) })}
            className={chip(false)}
          >
            სხვა დღე…
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-hour`} className="sr-only">
          საათი
        </label>
        {/* Wrapped for width: the control itself is full-width by design. */}
        <div className="w-24">
          <Select
            id={`${id}-hour`}
            value={value.hour}
            onChange={(event) => onChange({ ...value, hour: event.target.value })}
            className="tabular"
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hour}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-ink-faint" aria-hidden="true">
          :
        </span>
        <label htmlFor={`${id}-minute`} className="sr-only">
          წუთი
        </label>
        <div className="w-24">
          <Select
            id={`${id}-minute`}
            value={value.minute}
            onChange={(event) =>
              onChange({ ...value, minute: event.target.value })
            }
            className="tabular"
          >
            {MINUTES.map((minute) => (
              <option key={minute} value={minute}>
                {minute}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
