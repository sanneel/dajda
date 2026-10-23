'use client';

import { useId } from 'react';
import { Select } from '@/components/ui/field';

/**
 * When a match starts, without a datetime widget.
 *
 * The native datetime-local control asks for month, day, year, hour, minute
 * and AM/PM in a locale the author does not read, one segment at a time. So
 * the day comes from a calendar that opens on click, and the hour and minute
 * are picked from lists.
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
  /** Marks the date red when the form was submitted without a day. */
  invalid?: boolean;
  /** The earliest day that makes sense (the first match, for the last one). */
  minDay?: string;
}) {
  const id = useId();

  return (
    <div className="space-y-3">
      <input
        type="date"
        aria-label="თარიღი"
        value={value.day}
        min={minDay ?? localDay(0)}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker();
          } catch {}
        }}
        onChange={(event) => onChange({ ...value, day: event.target.value })}
        className={`min-h-11 w-full max-w-xs rounded-control border bg-surface px-4 text-sm text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          invalid ? 'border-loss/60' : 'border-line hover:border-ink-faint'
        }`}
      />

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
