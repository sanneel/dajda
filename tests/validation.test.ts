import { describe, expect, it } from 'vitest';
import {
  createPredictionSchema,
  markFinishedSchema,
  loginSchema,
  oddsSchema,
  ticketFilterSchema,
  freeTicketSchema,
  registerSchema,
  settlePredictionSchema,
  stakeUnitsSchema,
  telegramUsernameSchema,
} from '@/lib/validation/schemas';

/**
 * Input validation. Every one of these represents a value an attacker or a
 * confused browser can send directly.
 */

const validRegistration = {
  name: 'გიორგი ბერიძე',
  email: 'Giorgi@Dajda.GE',
  password: 'SecurePass99',
  ageConfirmed: true,
  acceptTerms: true,
};

describe('registration', () => {
  it('accepts a valid registration', () => {
    const parsed = registerSchema.safeParse(validRegistration);
    expect(parsed.success).toBe(true);
  });

  it('normalises the email to lowercase', () => {
    const parsed = registerSchema.parse(validRegistration);
    expect(parsed.email).toBe('giorgi@dajda.ge');
  });

  it('rejects a malformed email', () => {
    const parsed = registerSchema.safeParse({
      ...validRegistration,
      email: 'not-an-email',
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces the password policy', () => {
    // Too short.
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'Short1' })
        .success,
    ).toBe(false);
    // No digit.
    expect(
      registerSchema.safeParse({
        ...validRegistration,
        password: 'NoDigitsHereAtAll',
      }).success,
    ).toBe(false);
    // No letter.
    expect(
      registerSchema.safeParse({
        ...validRegistration,
        password: '1234567890123',
      }).success,
    ).toBe(false);
  });

  it('requires the age confirmation to be checked', () => {
    const parsed = registerSchema.safeParse({
      ...validRegistration,
      ageConfirmed: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('requires the terms to be accepted', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, acceptTerms: false })
        .success,
    ).toBe(false);
  });

  it('rejects an over-long name', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, name: 'ა'.repeat(200) })
        .success,
    ).toBe(false);
  });
});

describe('telegram username', () => {
  it('strips a leading @', () => {
    expect(telegramUsernameSchema.parse('@dajda_user')).toBe('dajda_user');
  });

  it('rejects invalid handles', () => {
    for (const bad of ['ab', 'has spaces', 'ქართული', 'x'.repeat(40)]) {
      expect(telegramUsernameSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('login', () => {
  it('requires both fields', () => {
    expect(loginSchema.safeParse({ email: 'a@b.ge', password: '' }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ email: '', password: 'x' }).success).toBe(
      false,
    );
  });

  it('does not apply the password policy to login', () => {
    // An existing account may predate a policy change; login must still work.
    expect(
      loginSchema.safeParse({ email: 'a@b.ge', password: 'old' }).success,
    ).toBe(true);
  });
});

describe('odds and stake conversion', () => {
  it('converts decimal odds to thousandths', () => {
    expect(oddsSchema.parse('1.85')).toBe(1850);
    expect(oddsSchema.parse(2)).toBe(2000);
    expect(oddsSchema.parse('1.333')).toBe(1333);
  });

  it('rejects odds of 1.00 or below', () => {
    // Odds of 1 or less imply no return; they would corrupt every ROI figure.
    expect(oddsSchema.safeParse('1').success).toBe(false);
    expect(oddsSchema.safeParse('0.5').success).toBe(false);
    expect(oddsSchema.safeParse('-2').success).toBe(false);
  });

  it('rejects non-numeric odds', () => {
    expect(oddsSchema.safeParse('abc').success).toBe(false);
  });

  it('converts stake units to hundredths and rejects non-positive stakes', () => {
    expect(stakeUnitsSchema.parse('1.5')).toBe(150);
    expect(stakeUnitsSchema.safeParse('0').success).toBe(false);
    expect(stakeUnitsSchema.safeParse('-1').success).toBe(false);
    expect(stakeUnitsSchema.safeParse('999').success).toBe(false);
  });
});

describe('free ticket filters', () => {
  it('defaults to page 1', () => {
    expect(ticketFilterSchema.parse({}).page).toBe(1);
  });

  it('coerces a numeric page from the query string', () => {
    expect(ticketFilterSchema.parse({ page: '3' }).page).toBe(3);
  });

  it('rejects a page outside the allowed range', () => {
    expect(ticketFilterSchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ticketFilterSchema.safeParse({ page: '9999' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(ticketFilterSchema.safeParse({ status: 'DROP TABLE' }).success).toBe(
      false,
    );
  });

  /*
   * The free feed must not accept a visibility filter: it is the one public
   * surface that lists bets, so a query string that could ask for PREMIUM
   * would be an attempt to walk past a paywall. Zod strips unknown keys, so
   * the assertion is that the parsed value carries no such field.
   */
  it('does not carry a visibility filter through', () => {
    const parsed = ticketFilterSchema.parse({ visibility: 'PREMIUM' });
    expect('visibility' in parsed).toBe(false);
  });
});

describe('bet creation', () => {
  const valid = {
    sportId: '00000000-0000-4000-8000-000000000001',
    screenshotPath: '/uploads/0123456789abcdef0123456789abcdef.webp',
    odds: '1.85',
    titleKa: 'დინამო vs საბურთალო, ტოტალი',
  };

  it('accepts a valid payload', () => {
    expect(createPredictionSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a screenshot, so no bet exists without its evidence', () => {
    const { screenshotPath: _omitted, ...withoutSlip } = valid;
    expect(createPredictionSchema.safeParse(withoutSlip).success).toBe(false);
  });

  it('rejects an upload path that is not one we generated', () => {
    // The stored name shape is the whole defence against a crafted form value
    // pointing the record at an arbitrary file.
    for (const bad of [
      '/uploads/../../etc/passwd',
      '/uploads/evil.svg',
      'https://elsewhere.example/x.webp',
      '/uploads/short.webp',
    ]) {
      expect(
        createPredictionSchema.safeParse({ ...valid, screenshotPath: bad })
          .success,
      ).toBe(false);
    }
  });

  it('rejects a non-uuid sport', () => {
    expect(
      createPredictionSchema.safeParse({ ...valid, sportId: 'abc' }).success,
    ).toBe(false);
  });

  it('rejects odds at or below evens', () => {
    expect(
      createPredictionSchema.safeParse({ ...valid, odds: '1.00' }).success,
    ).toBe(false);
  });

  it('makes the description optional', () => {
    expect(createPredictionSchema.safeParse(valid).success).toBe(true);
    expect(
      createPredictionSchema.safeParse({ ...valid, descriptionKa: 'ტექსტი' })
        .success,
    ).toBe(true);
  });

  /*
   * Regression guard. The schema TRANSFORMS these two fields into their stored
   * integer scale, so every write path must use the parsed value as-is. A
   * second multiplication in the service stored 1.85 as odds 1850.00.
   */
  it('returns odds and stake already in their stored scale', () => {
    const parsed = createPredictionSchema.parse({ ...valid, stakeUnits: '1.5' });
    expect(parsed.odds).toBe(1850);
    expect(parsed.stakeUnits).toBe(150);
  });

  it('scales a free ticket the same way', () => {
    const parsed = freeTicketSchema.parse({
      sportId: valid.sportId,
      screenshotPath: valid.screenshotPath,
      titleKa: valid.titleKa,
      odds: '2.10',
    });
    expect(parsed.odds).toBe(2100);
  });

  it('defaults to an unpublished, public, medium-confidence draft', () => {
    const parsed = createPredictionSchema.parse(valid);
    expect(parsed.publishNow).toBe(false);
    expect(parsed.visibility).toBe('PUBLIC');
    expect(parsed.confidence).toBe('MEDIUM');
    expect(parsed.stakeUnits).toBe(100);
  });
});

describe('marking a bet finished', () => {
  const predictionId = '00000000-0000-4000-8000-000000000001';

  it('accepts no result screenshot, so a bet can always be closed', () => {
    expect(markFinishedSchema.safeParse({ predictionId }).success).toBe(true);
  });

  it('validates the result screenshot path when one is given', () => {
    expect(
      markFinishedSchema.safeParse({
        predictionId,
        resultScreenshotPath: '/uploads/0123456789abcdef0123456789abcdef.webp',
      }).success,
    ).toBe(true);
    expect(
      markFinishedSchema.safeParse({
        predictionId,
        resultScreenshotPath: '/uploads/../secret.webp',
      }).success,
    ).toBe(false);
  });
});

describe('settlement input', () => {
  const valid = {
    predictionId: '00000000-0000-4000-8000-000000000001',
    outcome: 'WON',
    settlementSource: 'ლიგის ოფიციალური ოქმი',
  };

  it('accepts a valid settlement', () => {
    expect(settlePredictionSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a settlement source', () => {
    // A result with no stated source is not verifiable.
    expect(
      settlePredictionSchema.safeParse({ ...valid, settlementSource: '' })
        .success,
    ).toBe(false);
  });

  it('refuses PENDING as a settled outcome', () => {
    expect(
      settlePredictionSchema.safeParse({ ...valid, outcome: 'PENDING' }).success,
    ).toBe(false);
  });
});
