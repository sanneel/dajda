'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function ReferralLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label="თქვენი ბმული"
        onFocus={(event) => event.currentTarget.select()}
        className="tabular min-h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 text-sm text-ink"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-ink px-4 text-sm font-semibold text-on-ink transition-colors hover:bg-accent"
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? 'დაკოპირდა' : 'კოპირება'}
      </button>
    </div>
  );
}
