'use client';

import { useActionState, useRef } from 'react';
import { postNoteAction } from '@/actions/posts';
import { Field, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * The short composer that is not a bet.
 *
 * It used to sit behind a four-way tab strip alongside the bet form and the
 * broadcast, given equal weight on the workspace's main column. It is an
 * occasional action, so it opens from the "more" menu into a drawer (see
 * create-actions.tsx) and this file is just the form.
 */

export function NoteForm() {
  const [state, action, pending] = useActionState(postNoteAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      {state?.ok ? (
        <Alert tone="success">გამოქვეყნდა თქვენს ფიდზე.</Alert>
      ) : null}

      <Field label="რას წერთ" htmlFor="note-body" required error={errorFor('bodyKa')}>
        <Textarea id="note-body" name="bodyKa" rows={5} maxLength={1200} required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'ქვეყნდება…' : 'გამოქვეყნება'}
      </Button>
    </form>
  );
}
