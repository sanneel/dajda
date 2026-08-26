'use client';

import { useActionState, useRef, useState } from 'react';
import { Megaphone, MessageSquare, Radio, Ticket } from 'lucide-react';
import { announceLiveAction, postNoteAction } from '@/actions/posts';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { PostBetForm } from './post-form';
import { BroadcastForm } from './broadcast-form';

type Mode = 'bet' | 'note' | 'live' | 'broadcast';

/**
 * One composer, four things an analyst can publish.
 *
 * These used to be three cards stacked down the page plus a fourth nowhere,
 * which meant the page opened on whichever form happened to be first and the
 * rest were a scroll away. They are all the same gesture - write something,
 * publish it - and what actually differs between them is WHO it reaches, so
 * that is what the tab strip is sorted by: the bet goes on the public record,
 * a status is read by whoever visits, a live notice and a broadcast land in
 * other people's notifications.
 *
 * The two that interrupt people say so inside themselves rather than here, at
 * the moment of writing.
 */
export function AnalystComposer({
  sports,
  audienceSize,
  broadcastsRemaining,
  broadcastsPerDay,
}: {
  sports: { value: string; label: string }[];
  audienceSize: number;
  broadcastsRemaining: number;
  broadcastsPerDay: number;
}) {
  const [mode, setMode] = useState<Mode>('bet');

  return (
    <div>
      <div
        role="tablist"
        aria-label="რას ვაქვეყნებ"
        className="flex flex-wrap gap-1 border-b border-line"
      >
        <ModeTab
          selected={mode === 'bet'}
          onSelect={() => setMode('bet')}
          icon={<Ticket className="size-4" aria-hidden="true" />}
          label="ახალი ბილეთი"
        />
        <ModeTab
          selected={mode === 'note'}
          onSelect={() => setMode('note')}
          icon={<MessageSquare className="size-4" aria-hidden="true" />}
          label="სტატუსი"
        />
        <ModeTab
          selected={mode === 'live'}
          onSelect={() => setMode('live')}
          icon={<Radio className="size-4" aria-hidden="true" />}
          label="ლაივი"
        />
        <ModeTab
          selected={mode === 'broadcast'}
          onSelect={() => setMode('broadcast')}
          icon={<Megaphone className="size-4" aria-hidden="true" />}
          label="შეტყობინება"
          badge={`${broadcastsRemaining}/${broadcastsPerDay}`}
        />
      </div>

      <div className="pt-5">
        {mode === 'bet' ? <PostBetForm sports={sports} /> : null}
        {mode === 'note' ? <NoteForm /> : null}
        {mode === 'live' ? <LiveForm /> : null}
        {mode === 'broadcast' ? (
          <BroadcastForm
            audienceSize={audienceSize}
            remaining={broadcastsRemaining}
            perDay={broadcastsPerDay}
          />
        ) : null}
      </div>
    </div>
  );
}

function ModeTab({
  selected,
  onSelect,
  label,
  icon,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm transition-colors ${
        selected
          ? 'border-ink font-semibold text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {icon}
      {label}
      {badge ? (
        <span className="tabular rounded-full bg-elevated px-1.5 text-xs text-ink-faint">
          {badge}
        </span>
      ) : null}
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
          ახლა შეგიძლიათ დაიწყოთ ლაივ პოსტების დამატება.
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
       * Stated before the fields, not after the send. This and the broadcast
       * are the only actions that write into other people's notifications.
       */}
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
