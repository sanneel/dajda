'use client';

import { useActionState } from 'react';
import { Megaphone } from 'lucide-react';
import { sendBroadcastAction } from '@/actions/broadcast';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Write to the audience.
 *
 * The cost is stated before the field, not after the send: how many people it
 * reaches and how many sends are left today. This is the one composer here
 * whose output lands on other people's phones, and an analyst should know the
 * size of that before typing, not discover it in a confirmation.
 */
export function BroadcastForm({
  audienceSize,
  remaining,
  perDay,
}: {
  audienceSize: number;
  remaining: number;
  perDay: number;
}) {
  const [state, action, pending] = useActionState(sendBroadcastAction, null);

  const errorFor = (field: string) =>
    state && !state.ok ? state.error.fieldErrors?.[field]?.[0] : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="შეტყობინება გაიგზავნა">
          მიმღები: <span className="tabular">{state.data.recipients}</span>{' '}
          (Telegram <span className="tabular">{state.data.telegram}</span>,
          ელფოსტა <span className="tabular">{state.data.email}</span>).
          მიტანილია <span className="tabular">{state.data.sent}</span>
          {state.data.queued > 0 ? (
            <>
              , რიგში დარჩა{' '}
              <span className="tabular">{state.data.queued}</span>
            </>
          ) : null}
          . დღეს დარჩა{' '}
          <span className="tabular">{state.data.remaining}</span>.
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

  const exhausted = remaining <= 0;

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.error.fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <p className="flex items-start gap-2 rounded-card border border-line bg-canvas px-3.5 py-3 text-sm text-ink-muted">
        <Megaphone
          className="mt-0.5 size-4 shrink-0 text-signal"
          aria-hidden="true"
        />
        <span>
          მიდის <span className="tabular font-medium text-ink">{audienceSize}</span>{' '}
          ადამიანთან (გამომწერები და შემნახველები). დღეს დარჩა{' '}
          <span className="tabular font-medium text-ink">{remaining}</span> / {perDay}.
        </span>
      </p>

      {exhausted ? (
        <Alert tone="warning">
          დღევანდელი ლიმიტი ამოწურულია. განახლდება შუაღამეს.
        </Alert>
      ) : null}

      <Field
        label="სათაური"
        htmlFor="broadcast-subject"
        required
        error={errorFor('subjectKa')}
        hint="ეს ჩანს შეტყობინების პირველ ხაზში."
      >
        <Input
          id="broadcast-subject"
          name="subjectKa"
          required
          maxLength={120}
          disabled={exhausted}
        />
      </Field>

      <Field
        label="ტექსტი"
        htmlFor="broadcast-body"
        required
        error={errorFor('bodyKa')}
      >
        <Textarea
          id="broadcast-body"
          name="bodyKa"
          rows={4}
          maxLength={2000}
          required
          disabled={exhausted}
        />
      </Field>

      <Button type="submit" disabled={pending || exhausted}>
        {pending ? 'იგზავნება…' : 'გაგზავნა'}
      </Button>
    </form>
  );
}
