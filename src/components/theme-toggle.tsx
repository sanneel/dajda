'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_STORAGE_KEY } from './theme-script';

type Theme = 'light' | 'dark' | 'system';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'ღია თემა', Icon: Sun },
  { value: 'dark', label: 'მუქი თემა', Icon: Moon },
  { value: 'system', label: 'სისტემის მიხედვით', Icon: Monitor },
];

/*
 * The stored choice is external state, so it is read through
 * useSyncExternalStore rather than copied into React state inside an effect.
 * That avoids the cascading render an effect-plus-setState would cause, and it
 * comes with the cross-tab behaviour for free: `storage` fires in every other
 * tab, so switching the theme in one window updates the control in all of them.
 *
 * The server snapshot is null, which renders the control with nothing selected.
 * localStorage is unreadable during SSR, so any other answer would be a guess
 * that flickers when it turns out wrong.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function getServerSnapshot(): Theme | null {
  return null;
}

/**
 * Light / dark / system.
 *
 * Three states rather than two. A plain two-way switch has to pick a starting
 * side, which silently overrides whatever the reader already told their
 * operating system; "system" is the default and stays reachable.
 *
 * Rendered as a segmented control with real radio semantics, so it is operable
 * from the keyboard and announced as one choice rather than as three buttons
 * that happen to sit together.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const choose = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }

    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Private browsing can refuse storage. The attribute above still applies
      // for this page view, which is the part the reader actually asked for.
    }

    notify();
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="თემა"
      className="inline-flex items-center gap-0.5 rounded-control border border-line bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`inline-flex size-8 items-center justify-center rounded transition-colors ${
              selected ? 'bg-ink text-on-ink' : 'text-ink-faint hover:text-ink'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
