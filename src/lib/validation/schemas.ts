import { z } from 'zod';
import {
  ConfidenceLevel,
  PredictionStatus,
  PredictionVisibility,
  ReportReason,
} from '@/generated/prisma/enums';
import { parseTbilisiLocal } from '@/lib/time';

/**
 * A moment typed into a `datetime-local` control.
 *
 * The control hands over "2026-09-03T20:00" with no zone, and the naive
 * `z.coerce.date()` read that in the server's zone - UTC when hosted - so a
 * 20:00 kickoff was stored four hours late and printed as the next day. The
 * author typed Tbilisi time; this reads it as Tbilisi time. A Date, or a
 * string that already carries a zone, passes through unchanged.
 */
function wallClockSchema(message: string) {
  return z.preprocess(
    (value) =>
      typeof value === 'string' ? (parseTbilisiLocal(value) ?? value) : value,
    z.date({ error: message }),
  );
}

/**
 * Every externally supplied value enters the system through one of these.
 * Messages are Georgian because they surface directly in the UI.
 */

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const emailSchema = z
  .email('შეიყვანეთ სწორი ელფოსტა.')
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, 'პაროლი უნდა შეიცავდეს მინიმუმ 10 სიმბოლოს.')
  .max(200, 'პაროლი ძალიან გრძელია.')
  .refine((value) => /[a-zA-Zა-ჰ]/.test(value) && /[0-9]/.test(value), {
    error: 'პაროლი უნდა შეიცავდეს ასოსა და ციფრს.',
  });

/** Telegram's own rule: 5 to 32 chars, letters, digits and underscore. */
export const telegramUsernameSchema = z
  .string()
  .trim()
  .regex(
    /^@?[A-Za-z0-9_]{5,32}$/,
    'Telegram-ის მომხმარებელი უნდა შეიცავდეს 5-დან 32 სიმბოლომდე (ლათინური ასოები, ციფრები, _).',
  )
  .transform((value) => value.replace(/^@/, ''));

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს.')
    .max(80, 'სახელი ძალიან გრძელია.'),
  email: emailSchema,
  password: passwordSchema,
  ageConfirmed: z.literal(true, {
    error: 'რეგისტრაციისთვის საჭიროა 18 წლის ასაკის დადასტურება.',
  }),
  acceptTerms: z.literal(true, {
    error: 'გთხოვთ დაეთანხმოთ წესებსა და პირობებს.',
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'შეიყვანეთ პაროლი.'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

/*
 * The free feed takes two filters and a page, and nothing else.
 *
 * There is deliberately no `visibility` filter: the feed is public by
 * definition, so accepting one could only ever be an attempt to reach paid
 * bets through a hand-edited query string.
 */
export const ticketFilterSchema = z.object({
  sport: z.string().trim().min(1).max(40).optional(),
  status: z.enum(PredictionStatus).optional(),
  /**
   * Tick-style, combinable orderings. Odds and price carry a direction
   * (მაღალი/დაბალი); accuracy is a plain tick (highest first) and "soon"
   * is a plain tick (nearest kickoff first). They stack in display order;
   * with nothing ticked the feed falls back to "what starts soonest".
   */
  odds: z.enum(['high', 'low']).optional(),
  acc: z.literal('1').optional(),
  /** Paid feed only. */
  price: z.enum(['high', 'low']).optional(),
  soon: z.literal('1').optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export type TicketFilter = z.infer<typeof ticketFilterSchema>;

/** Odds are entered as "1.85" and stored as 1850. */
export const oddsSchema = z.coerce
  .number()
  .gt(1, 'კოეფიციენტი უნდა იყოს 1.00-ზე მეტი.')
  .lte(1000, 'კოეფიციენტი ძალიან დიდია.')
  .transform((value) => Math.round(value * 1000));

export const stakeUnitsSchema = z.coerce
  .number()
  .gt(0, 'ერთეული უნდა იყოს 0-ზე მეტი.')
  .lte(10, 'მაქსიმალური ერთეული არის 10.')
  .transform((value) => Math.round(value * 100));

/**
 * A stored upload path, as returned by the upload endpoint.
 *
 * Validated as a shape, not trusted as a string: it must be exactly one of our
 * own generated filenames under the uploads route, so a crafted form value
 * cannot point the record at an arbitrary path.
 */
export const uploadPathSchema = z
  .string()
  .regex(
    /^\/uploads\/[a-z0-9]{16,64}\.(webp|jpg|png)$/,
    'სურათის მისამართი არასწორია.',
  );

export const createPredictionSchema = z.object({
  sportId: z.uuid('აირჩიეთ სპორტი.'),
  /** The bet slip. A bet with no evidence is not a record. */
  screenshotPath: uploadPathSchema,
  /**
   * Optional: the slip is the bet, and requiring a title only made authors
   * narrate a picture the reader already has open. Left blank, the caller
   * derives one from the sport and the odds (see `postBetAction`).
   */
  titleKa: z
    .string()
    .trim()
    .max(160, 'სახელი ძალიან გრძელია.')
    .optional(),
  descriptionKa: z
    .string()
    .trim()
    .max(4000, 'აღწერა ძალიან გრძელია.')
    .optional(),
  /**
   * Photos 2..N of the same slip. The primary one is `screenshotPath`; these
   * are the extra legs that did not fit in one screenshot.
   */
  extraScreenshotPaths: z.array(uploadPathSchema).max(5).default([]),
  odds: oddsSchema,
  confidence: z.enum(ConfidenceLevel).default('MEDIUM'),
  /**
   * PUBLIC is free, PREMIUM is buyable singly (and included in the author's
   * subscription), VIP is subscription-only.
   */
  visibility: z.enum(PredictionVisibility).default('PUBLIC'),
  eventAt: wallClockSchema('მიუთითეთ პირველი მატჩის დრო.').optional(),
  /** When the last leg starts, on a ticket that spans several matches. */
  eventEndAt: wallClockSchema('მიუთითეთ ბოლო მატჩის დრო.').optional(),
  publishNow: z.coerce.boolean().default(false),
  /**
   * The single-purchase price of a paid bet, entered in GEL and stored in
   * minor units. A paid bet is its own product apart from the subscription,
   * so a price is required whenever visibility is not PUBLIC.
   */
  price: z.coerce
    .number()
    .min(1, 'ფასი მინიმუმ 1 ლარია.')
    .max(500, 'ფასი ძალიან დიდია.')
    .transform((value) => Math.round(value * 100))
    .optional(),
}).superRefine((data, ctx) => {
  /*
   * Only the singly-buyable type carries a price. A subscription-only ticket
   * (VIP) has none by definition - it is not for sale on its own - and a free
   * one obviously does not either.
   */
  if (data.visibility === 'PREMIUM' && data.price === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['price'],
      message: 'მიუთითეთ ბილეთის ფასი.',
    });
  }

  if (
    data.eventAt &&
    data.eventEndAt &&
    data.eventEndAt.getTime() < data.eventAt.getTime()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['eventEndAt'],
      message: 'ბოლო მატჩი პირველზე ადრე ვერ დაიწყება.',
    });
  }
});

/** Only presentation fields - the frozen set is not even accepted as input. */
export const editPublishedPredictionSchema = z.object({
  predictionId: z.uuid(),
  titleKa: z.string().trim().min(6).max(160),
  descriptionKa: z.string().trim().max(4000).optional(),
  confidence: z.enum(ConfidenceLevel),
  visibility: z.enum(PredictionVisibility),
});

/**
 * A community free ticket.
 *
 * Deliberately narrower than createPredictionSchema: no visibility (always
 * PUBLIC), no stake, no draft flag, no scheduling. A ticket posted by a
 * regular user is one screenshot, one title and the odds.
 */
export const freeTicketSchema = z.object({
  sportId: z.uuid('აირჩიეთ სპორტი.'),
  screenshotPath: uploadPathSchema,
  titleKa: z
    .string()
    .trim()
    .min(6, 'სათაური ძალიან მოკლეა.')
    .max(160, 'სათაური ძალიან გრძელია.'),
  descriptionKa: z.string().trim().max(2000).optional(),
  odds: oddsSchema,
});

// ---------------------------------------------------------------------------
// Feed posts
// ---------------------------------------------------------------------------

const postBodySchema = z
  .string()
  .trim()
  .min(2, 'ტექსტი ძალიან მოკლეა.')
  .max(1200, 'ტექსტი ძალიან გრძელია.');

export const notePostSchema = z.object({ bodyKa: postBodySchema });

/**
 * A live announcement. Both the time and the match label are required: an
 * announcement without them is a note, and it is the two of them together that
 * justify interrupting somebody's inbox.
 */
export const liveNoticeSchema = z.object({
  bodyKa: postBodySchema,
  liveAt: wallClockSchema('მიუთითეთ ლაივის დრო.'),
  liveLabelKa: z
    .string()
    .trim()
    .min(3, 'მიუთითეთ მატჩი ან ტურნირი.')
    .max(160, 'დასახელება ძალიან გრძელია.'),
});

export const liveUpdateSchema = z.object({
  parentId: z.uuid(),
  bodyKa: postBodySchema,
});

/**
 * A broadcast to the analyst's audience.
 *
 * A subject is required and short: it is the whole message in a Telegram
 * notification preview, and an inbox line with no subject is indistinguishable
 * from spam.
 */
export const broadcastSchema = z.object({
  subjectKa: z
    .string()
    .trim()
    .min(4, 'სათაური ძალიან მოკლეა.')
    .max(120, 'სათაური ძალიან გრძელია.'),
  bodyKa: z
    .string()
    .trim()
    .min(10, 'ტექსტი ძალიან მოკლეა.')
    .max(2000, 'ტექსტი ძალიან გრძელია.'),
});

/** The author handing a finished bet to an admin. */
export const markFinishedSchema = z.object({
  predictionId: z.uuid(),
  /** Optional: an admin can verify without it, just more slowly. */
  resultScreenshotPath: uploadPathSchema.optional(),
});

export const settlePredictionSchema = z.object({
  predictionId: z.uuid(),
  outcome: z.enum(['WON', 'LOST', 'VOID', 'PUSH']),
  actualValue: z.coerce.number().optional(),
  settlementSource: z
    .string()
    .trim()
    .min(3, 'მიუთითეთ შედეგის წყარო.')
    .max(200),
  note: z.string().trim().max(1000).optional(),
});

export const correctPredictionSchema = z.object({
  predictionId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'შესწორების მიზეზი სავალდებულოა.')
    .max(500),
  odds: oddsSchema.optional(),
  titleKa: z.string().trim().min(6).max(160).optional(),
  descriptionKa: z.string().trim().max(4000).optional(),
  screenshotPath: uploadPathSchema.optional(),
});

// ---------------------------------------------------------------------------
// Subscriptions, moderation, account
// ---------------------------------------------------------------------------

export const subscribeSchema = z.object({
  planId: z.uuid('აირჩიეთ გეგმა.'),
});

export const cancelSubscriptionSchema = z.object({
  subscriptionId: z.uuid(),
});

export const reportSchema = z.object({
  targetType: z.enum(['ANALYST', 'PREDICTION']),
  targetId: z.uuid(),
  reason: z.enum(ReportReason),
  details: z.string().trim().max(1000).optional(),
});

export const resolveReportSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(['RESOLVED', 'DISMISSED', 'REVIEWING']),
  resolutionNote: z.string().trim().max(1000).optional(),
});

export const notificationPreferencesSchema = z.object({
  emailOnNewPrediction: z.coerce.boolean().default(false),
  emailOnSettlement: z.coerce.boolean().default(false),
  emailOnLiveSession: z.coerce.boolean().default(false),
  emailProductUpdates: z.coerce.boolean().default(false),
  telegramEnabled: z.coerce.boolean().default(false),
  telegramUsername: telegramUsernameSchema.optional().or(z.literal('')),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const analystApplicationSchema = z.object({
  /** Legal name, verified against the identity document by an administrator. */
  firstName: z.string().trim().min(2, 'შეიყვანეთ სახელი.').max(40),
  lastName: z.string().trim().min(2, 'შეიყვანეთ გვარი.').max(40),
  /** The public byline, which may differ from the legal name. */
  displayName: z.string().trim().min(2, 'შეიყვანეთ საჯარო სახელი.').max(60),
  referralSource: z
    .string()
    .trim()
    .min(2, 'მიუთითეთ, ვისი რეკომენდაციით ან საიდან მოხვდით პლატფორმაზე.')
    .max(200),
  primarySportId: z.uuid('აირჩიეთ ძირითადი მიმართულება.'),
  /**
   * Clause 6.4: the author declares their own monthly floor here, and the
   * platform's floor under it is 8. It is published on their page, so it is
   * a promise to buyers rather than a preference.
   */
  monthlyMinimum: z.coerce
    .number('მიუთითეთ პროგნოზების რაოდენობა.')
    .int('რაოდენობა მთელი რიცხვი უნდა იყოს.')
    .min(8, 'თვეში მინიმუმ 8 პროგნოზია საჭირო.')
    .max(200, 'რაოდენობა ძალიან დიდია.'),
  headline: z.string().trim().max(120).optional(),
  bio: z.string().trim().min(40, 'აღწერა ძალიან მოკლეა.').max(2000),
  acceptTerms: z.literal(true, {
    message: 'წესებზე თანხმობის გარეშე განაცხადი არ მიიღება.',
  }),
});

export const analystDecisionSchema = z.object({
  analystProfileId: z.uuid(),
  decision: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional(),
});

export const userStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(300).optional(),
});

export const saveAnalystSchema = z.object({
  analystProfileId: z.uuid(),
});

export const topUpSchema = z.object({
  /** The form takes lari; minor units are derived server-side. */
  amountGel: z.coerce
    .number('შეიყვანეთ თანხა.')
    .min(1, 'მინიმუმ 1 ლარი.')
    .max(500, 'მაქსიმუმ 500 ლარი ერთ შევსებაზე.'),
});

export const withdrawalSchema = z.object({
  amountGel: z.coerce
    .number('შეიყვანეთ თანხა.')
    .positive('თანხა უნდა იყოს დადებითი.')
    .max(100000, 'ერთ მოთხოვნაზე მაქსიმუმი 100000 ლარია.'),
  /** Spaces and other separators are stripped before the Luhn check. */
  cardNumber: z
    .string()
    .trim()
    .min(13, 'ბარათის ნომერი არასწორია.')
    .max(32, 'ბარათის ნომერი არასწორია.'),
});

export const payoutDecisionSchema = z.object({
  payoutId: z.uuid(),
  decision: z.enum(['APPROVE', 'REJECT']),
  /** Required to approve: the number is never stored, so it is re-entered. */
  cardNumber: z.string().trim().min(13).max(32).optional(),
  reason: z.string().trim().max(300).optional(),
});
