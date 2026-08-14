'use client';

import { useActionState, useRef } from 'react';
import { endLiveAction, postLiveUpdateAction } from '@/actions/posts';
import { Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Controls for a session that is currently running.
 *
 * Posting an update is one field and one button: during a live session the
 * author is watching a match, not filling in a form. Ending the session is a
 * separate, quieter control, because it cannot be undone.
 */
export function LiveSessionControls({ postId }: { postId: string }) {
  const [updateState, updateAction, updatePending] = useActionState(
    postLiveUpdateAction,
    null,
  );
  const [endState, endAction, endPending] = useActionState(endLiveAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-3">
      {updateState && !updateState.ok ? (
        <Alert tone="error">{updateState.error.message}</Alert>
      ) : null}
      {endState && !endState.ok ? (
        <Alert tone="error">{endState.error.message}</Alert>
      ) : null}

      <form
        ref={formRef}
        action={async (formData) => {
          await updateAction(formData);
          formRef.current?.reset();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="parentId" value={postId} />
        <label htmlFor={`update-${postId}`} className="sr-only">
          ლაივ პოსტი
        </label>
        <Textarea
          id={`update-${postId}`}
          name="bodyKa"
          rows={2}
          maxLength={1200}
          required
          placeholder="რა ხდება ახლა…"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={updatePending}>
            {updatePending ? 'იგზავნება…' : 'დამატება'}
          </Button>
        </div>
      </form>

      <form action={endAction}>
        <input type="hidden" name="postId" value={postId} />
        <Button type="submit" variant="ghost" size="sm" disabled={endPending}>
          {endPending ? 'სრულდება…' : 'ლაივის დასრულება'}
        </Button>
      </form>
    </div>
  );
}
