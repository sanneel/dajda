import type { AnalystStatus } from '@/generated/prisma/enums';

/**
 * Who owns a person's name.
 *
 * An ordinary reader's name is theirs: it appears nowhere anyone relies on and
 * they may correct a typo in it whenever they like.
 *
 * An analyst's is not. Becoming one means submitting a photographed identity
 * document and having an administrator check the name against it, and the
 * whole product rests on a reader being able to tell who published a record.
 * A rename after approval would silently break that link - the name on the
 * document, on the payout, and in the audit log would all drift apart - so it
 * stops being self-service and becomes an administrator's correction.
 *
 * A REJECTED applicant is not held to it: nothing was verified, there is no
 * public record, and they are an ordinary reader again.
 */
export function canChangeOwnName(actor: {
  analystProfileId?: string | null;
  analystStatus?: AnalystStatus | null;
}): boolean {
  if (!actor.analystProfileId) return true;
  return actor.analystStatus === 'REJECTED';
}

/** Why the field is locked, for the person reading the form. */
export const NAME_LOCKED_KA =
  'სახელი დაკავშირებულია დამოწმებულ პირადობასთან და მისი შეცვლა ადმინისტრაციის მეშვეობითაა შესაძლებელი.';
