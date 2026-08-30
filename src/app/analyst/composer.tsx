'use client';

import { useActionState, useRef } from 'react';
import { Radio } from 'lucide-react';
import { announceLiveAction, postNoteAction } from '@/actions/posts';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * The two short composers that are not a bet.
 *
 * These used to sit behind a four-way tab strip alongside the bet form and the
 * broadcast, given equal weight on the workspace's main column. They are
 * occasional actions, so they now open from the "more" menu into a drawer
 * (see create-actions.tsx) and this file is just the forms.
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

export function LiveForm() {
  const [state, action, pending] = useActionState(announceLiveAction, null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="ლაივი გამოცხადდა">
          შეტყობინება მომზადდა{' '}
          <span className="tabular">{state.data.queued}</span> მიმღებისთვის.
          ახლა შეგიძლიათ დაიწყოთ ლაივ პოსტების დამატება.
        </Alert>
        <Button type="button" onClick={() => window.location.reload()}>
          განახლება
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      {/* Stated before the fields, not after the send: this is one of the two
          actions that write into other people's notifications. */}
      <p className="flex items-start gap-2 rounded-card border border-line bg-canvas px-3.5 py-3 text-sm text-ink-muted">
        <Radio className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
        გამომწერებსა და შემნახველებს მიუვათ შეტყობინება.
      </p>

      <Field
        label="მატჩი ან ტურნირი"
        htmlFor="live-label"
        required
        error={errorFor('liveLabelKa')}
        hint="მაგ: დინამო თბილისი vs საბურთალო"
      >
        <Input id="live-label" name="liveLabelKa" required maxLength={160} />
      </Field>

      <Field
        label="დაწყების დრო"
        htmlFor="live-at"
        required
        error={errorFor('liveAt')}
      >
        <Input id="live-at" name="liveAt" type="datetime-local" required />
      </Field>

      <Field label="რას წერთ" htmlFor="live-body" required error={errorFor('bodyKa')}>
        <Textarea id="live-body" name="bodyKa" rows={4} maxLength={1200} required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'ცხადდება…' : 'ლაივის გამოცხადება'}
      </Button>
    </form>
  );
}
