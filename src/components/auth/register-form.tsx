'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registerAction } from '@/actions/auth';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  const errorFor = (field: string) => fieldErrors?.[field]?.[0];

  return (
    <form action={action} className="space-y-4" noValidate>
      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <Field label="სახელი" htmlFor="name" required error={errorFor('name')}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          error={Boolean(errorFor('name'))}
        />
      </Field>

      <Field
        label="ელფოსტა"
        htmlFor="email"
        required
        error={errorFor('email')}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="mail@example.ge"
          error={Boolean(errorFor('email'))}
        />
      </Field>

      <Field
        label="პაროლი"
        htmlFor="password"
        required
        hint="მინიმუმ 10 სიმბოლო, უნდა შეიცავდეს ასოსა და ციფრს."
        error={errorFor('password')}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={Boolean(errorFor('password'))}
        />
      </Field>

      <Field
        label="Telegram (არასავალდებულო)"
        htmlFor="telegramUsername"
        hint="მომავალში გამოგვადგება შეტყობინებებისთვის. ბოტი ჯერ არ არის აქტიური."
        error={errorFor('telegramUsername')}
      >
        <Input
          id="telegramUsername"
          name="telegramUsername"
          placeholder="@username"
          error={Boolean(errorFor('telegramUsername'))}
        />
      </Field>

      <div className="space-y-1 border-t border-line pt-4">
        <Checkbox
          id="ageConfirmed"
          name="ageConfirmed"
          label="ვადასტურებ, რომ ვარ 18 წლის ან მეტის."
          error={errorFor('ageConfirmed')}
        />

        {/*
         * The load-bearing clauses, in front of the box that accepts them.
         * Every line is a restatement of the terms the checkbox below binds
         * the person to (2.2, 4.1, 7.2, 9.1, 9.3, 11.3), because "I have read
         * the terms" is only true if the terms that matter were readable
         * without leaving the form.
         */}
        <ul className="space-y-1.5 rounded-md border border-line bg-elevated p-3.5 text-xs leading-relaxed text-ink-muted">
          <li>
            DAJDA ყიდის მხოლოდ ანალიტიკურ კონტენტს. პლატფორმა არ არის
            ბუკმეკერი, ფსონს არ იღებს და მოგებას არ იხდის.
          </li>
          <li>
            არავითარი შედეგი არ არის გარანტირებული. ავტორების სტატისტიკა
            წარსულ შედეგებს ასახავს.
          </li>
          <li>
            რეგისტრაცია უფასოა. გამოწერა ცალკე ფორმდება კონკრეტულ ავტორზე და
            ღირს 30, 40 ან 50 ლარი თვეში.
          </li>
          <li>
            გამოწერა ავტომატურად განახლდება, სანამ არ გააუქმებთ. გაუქმება
            ნებისმიერ დროს შეიძლება და წვდომა რჩება გადახდილი პერიოდის
            ბოლომდე.
          </li>
          <li>პლატფორმა 18 წელს მიღწეულთათვისაა.</li>
        </ul>

        <Checkbox
          id="acceptTerms"
          name="acceptTerms"
          label={
            <>
              ვეთანხმები{' '}
              <Link href="/legal#terms" className="text-accent underline">
                წესებსა და პირობებს
              </Link>{' '}
              და{' '}
              <Link href="/legal#privacy" className="text-accent underline">
                კონფიდენციალურობის პოლიტიკას
              </Link>
              .
            </>
          }
          error={errorFor('acceptTerms')}
        />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'იქმნება…' : 'ანგარიშის შექმნა'}
      </Button>

      <p className="text-xs leading-relaxed text-ink-faint">
        ანგარიშის შექმნით ეთანხმებით{' '}
        <Link href="/legal#terms" className="text-accent underline">
          წესებსა და პირობებს
        </Link>
        . ანგარიშის დახურვა ნებისმიერ დროს შეგიძლიათ.
      </p>
    </form>
  );
}
