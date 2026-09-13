import { describe, expect, it } from 'vitest';
import {
  analystApplicationSchema,
  createPredictionSchema,
  monthlyMinimumSchema,
  registerSchema,
  reportSchema,
  saveAnalystSchema,
  settlePredictionSchema,
  subscribeSchema,
  updateProfileSchema,
  uploadPathSchema,
  withdrawalSchema,
} from '@/lib/validation/schemas';

/**
 * Negative tests: what the product must REFUSE.
 *
 * The rest of the suite mostly proves the happy path still works, which is
 * the half that fails loudly. These are the inputs nobody types by accident -
 * a hand-edited form value, a replayed request, a number outside the range
 * the UI offers - and they fail silently, by being accepted.
 *
 * Every case here is an input that reaches a server action from a browser,
 * so "the form would not send that" is not an answer: the form is a
 * courtesy, the schema is the rule.
 *
 * Each group asserts its own control first. A negative test whose baseline is
 * already invalid passes for the wrong reason and proves nothing - which is
 * exactly what happened here on the first draft, where the registration cases
 * named a field the schema does not have and "refused" everything, including
 * a perfectly valid account.
 */

const UUID = '00000000-0000-4000-8000-000000000001';

describe('image paths', () => {
  /*
   * This one is load-bearing. The path is written into a row and later served
   * back, so a value that escapes the uploads directory is a file-disclosure
   * bug rather than a cosmetic one. The shape is checked, never the string.
   */
  const refused = [
    '/uploads/../../etc/passwd',
    '/uploads/../secret.webp',
    '/uploads/..%2fsecret.webp',
    '/etc/passwd',
    'uploads/abcdef0123456789.webp', // no leading slash
    '/uploads/abcdef0123456789.svg', // SVG carries script
    '/uploads/abcdef0123456789.webp.exe',
    '/uploads/ABCDEF0123456789.webp', // the store never emits upper case
    '/uploads/short.webp',
    '//evil.example.com/x.webp',
    'https://evil.example.com/x.webp',
    '/uploads/abcdef0123456789.webp\n/uploads/other.webp',
    '/uploads/abcdef0123456789.webp?../../x',
    '',
  ];

  for (const path of refused) {
    it(`refuses ${JSON.stringify(path)}`, () => {
      expect(uploadPathSchema.safeParse(path).success).toBe(false);
    });
  }

  it('accepts only what the store itself writes', () => {
    expect(uploadPathSchema.safeParse('/uploads/0123456789abcdef.webp').success).toBe(true);
  });
});

describe('posting a bet', () => {
  const valid = {
    sportId: UUID,
    screenshotPath: '/uploads/0123456789abcdef.webp',
    odds: '1.85',
    visibility: 'PUBLIC',
  };

  it('accepts the control, so the refusals below mean something', () => {
    expect(createPredictionSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a bet with no screenshot, whatever else is filled in', () => {
    // A bet with no evidence is not a record, and this is the only place that
    // rule can be enforced for every caller.
    const { screenshotPath: _omitted, ...withoutSlip } = valid;
    expect(createPredictionSchema.safeParse(withoutSlip).success).toBe(false);
  });

  it('refuses odds that cannot lose', () => {
    for (const odds of ['1', '1.00', '0.5', '-2', '0']) {
      expect(
        createPredictionSchema.safeParse({ ...valid, odds }).success,
      ).toBe(false);
    }
  });

  it('refuses odds that are not a number at all', () => {
    for (const odds of ['abc', '', '1.8.5', 'NaN', 'Infinity']) {
      expect(
        createPredictionSchema.safeParse({ ...valid, odds }).success,
      ).toBe(false);
    }
  });

  it('refuses a sport id that is not one', () => {
    for (const sportId of ['1', 'not-a-uuid', '', `${UUID} OR 1=1`]) {
      expect(
        createPredictionSchema.safeParse({ ...valid, sportId }).success,
      ).toBe(false);
    }
  });

  it('refuses a visibility the enum does not have', () => {
    for (const visibility of ['ADMIN', 'public', 'SECRET', '']) {
      expect(
        createPredictionSchema.safeParse({ ...valid, visibility }).success,
      ).toBe(false);
    }
  });

  it('refuses a slip longer than a slip', () => {
    const leg = { eventKa: 'a vs b', pickKa: '1', odds: '1.5' };
    expect(
      createPredictionSchema.safeParse({
        ...valid,
        selections: Array.from({ length: 21 }, () => leg),
      }).success,
    ).toBe(false);
  });
});

describe('settling a bet', () => {
  const valid = { predictionId: UUID, outcome: 'WON' };

  it('accepts the control, so the refusals below mean something', () => {
    expect(settlePredictionSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses an outcome that is not terminal', () => {
    for (const outcome of ['PENDING', 'VOID', 'won', 'WIN', '']) {
      expect(
        settlePredictionSchema.safeParse({ ...valid, outcome }).success,
      ).toBe(false);
    }
  });

  it('refuses a prediction id that is not one', () => {
    expect(
      settlePredictionSchema.safeParse({ ...valid, predictionId: 'x' }).success,
    ).toBe(false);
  });
});

describe('the declared monthly minimum', () => {
  it('refuses fewer than the terms allow', () => {
    // Terms 6.4: never fewer than eight. A buyer is shown this number before
    // paying, and every payout is judged against it.
    for (const value of [7, 1, 0, -5]) {
      expect(monthlyMinimumSchema.safeParse(value).success).toBe(false);
    }
  });

  it('refuses a fraction, which no month can deliver', () => {
    expect(monthlyMinimumSchema.safeParse(8.5).success).toBe(false);
  });

  it('refuses a promise nobody could keep', () => {
    expect(monthlyMinimumSchema.safeParse(10_000).success).toBe(false);
  });

  it('accepts the floor itself', () => {
    expect(monthlyMinimumSchema.safeParse(8).success).toBe(true);
  });
});

describe('withdrawing earnings', () => {
  const valid = { amountGel: '50', iban: 'GE29NB0000000101904917' };

  it('accepts the control, so the refusals below mean something', () => {
    expect(withdrawalSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a non-positive or absurd amount', () => {
    for (const amountGel of ['0', '-10', '1000000', 'abc', '']) {
      expect(withdrawalSchema.safeParse({ ...valid, amountGel }).success).toBe(
        false,
      );
    }
  });

  it('refuses an account number that is not the right length', () => {
    for (const iban of ['GE29NB', '', 'x'.repeat(40)]) {
      expect(withdrawalSchema.safeParse({ ...valid, iban }).success).toBe(false);
    }
  });
});

describe('ids that arrive from a form', () => {
  /*
   * Each of these is the only thing standing between a hand-edited hidden
   * field and a query. They are separate schemas and each has been forgotten
   * at least once somewhere, so they are asserted one by one.
   */
  it('accepts the controls, so the refusals below mean something', () => {
    expect(subscribeSchema.safeParse({ planId: UUID }).success).toBe(true);
    expect(
      saveAnalystSchema.safeParse({ analystProfileId: UUID }).success,
    ).toBe(true);
    expect(
      reportSchema.safeParse({
        targetType: 'ANALYST',
        targetId: UUID,
        reason: 'SPAM',
      }).success,
    ).toBe(true);
  });

  it('refuses a plan id that is not a uuid', () => {
    expect(subscribeSchema.safeParse({ planId: '1' }).success).toBe(false);
    expect(subscribeSchema.safeParse({ planId: '' }).success).toBe(false);
  });

  it('refuses an analyst id that is not a uuid', () => {
    expect(
      saveAnalystSchema.safeParse({ analystProfileId: 'me' }).success,
    ).toBe(false);
  });

  it('refuses a report against a target type that does not exist', () => {
    expect(
      reportSchema.safeParse({
        targetType: 'USER',
        targetId: UUID,
        reason: 'SPAM',
      }).success,
    ).toBe(false);
  });

  it('refuses a report reason the enum does not have', () => {
    expect(
      reportSchema.safeParse({
        targetType: 'ANALYST',
        targetId: UUID,
        reason: 'I_DONT_LIKE_THEM',
      }).success,
    ).toBe(false);
  });
});

describe('registration', () => {
  const valid = {
    name: 'სანდრო',
    email: 'someone@example.com',
    password: 'Str0ngPassphrase!',
    ageConfirmed: true,
    acceptTerms: true,
  };

  it('accepts the control, so the refusals below mean something', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses an account that has not confirmed being of age', () => {
    // Not a checkbox the form can quietly default: the platform is 18+.
    for (const ageConfirmed of [false, 'false', undefined, 'on']) {
      expect(
        registerSchema.safeParse({ ...valid, ageConfirmed }).success,
      ).toBe(false);
    }
  });

  it('refuses an account that has not accepted the terms', () => {
    expect(
      registerSchema.safeParse({ ...valid, acceptTerms: false }).success,
    ).toBe(false);
  });

  it('refuses an address that is not one', () => {
    for (const email of ['someone', 'someone@', '@example.com', 'a b@c.d', '']) {
      expect(registerSchema.safeParse({ ...valid, email }).success).toBe(false);
    }
  });
});

describe('an analyst application', () => {
  const valid = {
    firstName: 'სანდრო',
    lastName: 'სირაძე',
    displayName: 'xazo25',
    primarySportId: UUID,
    acceptTerms: true,
  };

  it('accepts the control, so the refusals below mean something', () => {
    expect(analystApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses an application that did not accept the terms', () => {
    // The agreement is what the identity check and the payouts rest on.
    for (const acceptTerms of [false, 'true', undefined]) {
      expect(
        analystApplicationSchema.safeParse({ ...valid, acceptTerms }).success,
      ).toBe(false);
    }
  });

  it('refuses a legal name too short to be one', () => {
    expect(
      analystApplicationSchema.safeParse({ ...valid, firstName: 'ს' }).success,
    ).toBe(false);
  });
});

describe('a name', () => {
  it('refuses one too short or too long to be a name', () => {
    expect(updateProfileSchema.safeParse({ name: 'a' }).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ name: 'a'.repeat(81) }).success,
    ).toBe(false);
  });

  it('refuses whitespace pretending to be a name', () => {
    expect(updateProfileSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
