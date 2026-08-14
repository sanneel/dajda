'use client';

import { useActionState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { toggleSavedAnalystAction } from '@/actions/subscriptions';

export function SaveAnalystButton({
  analystProfileId,
  initiallySaved,
}: {
  analystProfileId: string;
  initiallySaved: boolean;
}) {
  const [state, action, pending] = useActionState(
    toggleSavedAnalystAction,
    null,
  );

  // Trust the server's answer once we have one; fall back to the initial state.
  const saved = state?.ok ? state.data.saved : initiallySaved;

  return (
    <form action={action} className="shrink-0">
      <input
        type="hidden"
        name="analystProfileId"
        value={analystProfileId}
      />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={saved}
        className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm transition-colors disabled:opacity-45 ${
          saved
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
        }`}
      >
        {saved ? (
          <BookmarkCheck className="size-4" aria-hidden="true" />
        ) : (
          <Bookmark className="size-4" aria-hidden="true" />
        )}
        {saved ? 'შენახულია' : 'შენახვა'}
      </button>
    </form>
  );
}
