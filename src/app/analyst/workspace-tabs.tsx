'use client';

import { useState, type ReactNode } from 'react';

/**
 * The workspace's one switch: current, feed, settled, drafts.
 *
 * These were four stacked cards down a very long page, which meant the thing
 * an author opens this page to do - look at what is running right now - shared
 * the screen with a history nobody scrolls to. One panel at a time, current
 * first, and the counts sit on the tabs so switching is an informed choice
 * rather than a search.
 *
 * Every panel is rendered on the SERVER and passed in as a prop; this
 * component only decides which one is mounted. No bet data crosses into the
 * browser that the server did not already decide to print.
 */

export type WorkspaceTab = {
  id: string;
  label: string;
  count?: number;
  panel: ReactNode;
};

export function WorkspaceTabs({ tabs }: { tabs: WorkspaceTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div>
      {/* Scrolls sideways on a phone rather than wrapping into a ragged
          second row, the same rule the feed's sort chips follow. */}
      <div
        role="tablist"
        aria-label="ჩემი კონტენტი"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm transition-colors ${
                selected
                  ? 'border-accent font-semibold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span
                  className={`tabular rounded-full px-1.5 text-xs ${
                    selected
                      ? 'bg-accent/15 text-accent'
                      : 'bg-elevated text-ink-faint'
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {current ? (
        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          className="pt-5"
        >
          {current.panel}
        </div>
      ) : null}
    </div>
  );
}
