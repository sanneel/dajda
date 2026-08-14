'use client';

import { useActionState, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { announceLiveAction, postNoteAction } from '@/actions/posts';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * The feed composer: a status, or a live announcement.
 *
 * One box with a mode switch rather than two forms, because they are the same
 * gesture with one difference, and that difference is stated plainly under the
 * switch: a status is read whenever it is read, an announcement lands in
 * people's inboxes. An analyst should know which one they are about to do
 * before they write it, not after.
 */
export function FeedComposer() {
  const [mode, setMode] = useState<'note' | 'live'>('note');

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="პოსტის ტიპი"
        className="mb-4 flex gap-1 border-b border-line"
      >
        <ModeTab
          selected={mode === 'note'}
          onSelect={() => setMode('note')}
          label="სტატუსი"
        />
        <ModeTab
          selected={mode === 'live'}
          onSelect={() => setMode('live')}
          label="ლაივის გამოცხადება"
        />
      </div>

      {mode === 'note' ? <NoteForm /> : <LiveForm />}
    </div>
  );
}

function ModeTab({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`-mb-px min-h-11 border-b-2 px-4 text-sm transition-colors ${
        selected
          ? 'border-ink font-semibold text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function NoteForm() {
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

      <Field
        label="რას წერთ"
        htmlFor="note-body"
        required
        error={errorFor('bodyKa')}
        hint="ჩანს თქვენს ფიდზე. შეტყობინება არავის მიდის."
      >
        <Textarea id="note-body" name="bodyKa" rows={3} maxLength={1200} required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'ქვეყნდება…' : 'გამოქვეყნება'}
      </Button>
    </form>
  );
}

function LiveForm() {
  const [state, action, pending] = useActionState(announceLiveAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="ლაივი გამოცხადდა">
          შეტყობინება მომზადდა{' '}
          <span className="tabular">{state.data.queued}</span> მიმღებისთვის.
          გაგზავნა ჩაირთვება არხის კონფიგურაციის შემდეგ. ახლა შეგიძლიათ
          დაიწყოთ ლაივ პოსტების დამატება ქვემოთ.
        </Alert>
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.location.reload()}
        >
          განახლება
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      {/*
       * Stated before the fields, not after the send. This is the only action
       * in the product that writes into other people's inboxes.
       */}
      <p className="flex items-start gap-2 rounded-card border border-line bg-canvas px-3.5 py-3 text-sm text-ink-muted">
        <Radio className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
        გამომწერებსა და შემნახველებს მიუვათ შეტყობინება მეილზე ან ტელეგრამზე.
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

      <Field
        label="რას წერთ"
        htmlFor="live-body"
        required
        error={errorFor('bodyKa')}
      >
        <Textarea id="live-body" name="bodyKa" rows={3} maxLength={1200} required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'ცხადდება…' : 'ლაივის გამოცხადება'}
      </Button>
    </form>
  );
}
