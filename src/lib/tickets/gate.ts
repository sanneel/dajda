import type { PredictionVisibility } from '@/generated/prisma/enums';

/**
 * Why a ticket is shut, and therefore what the reader has to do about it.
 *
 * Three different answers, and the difference matters to the person reading:
 * a free ticket asks for an account, a paid one asks for a payment, a
 * subscription one asks for a monthly commitment to an author. Telling a
 * signed-out reader that a FREE prediction "opens with a subscription" is
 * both wrong and the most expensive kind of wrong - it advertises a price on
 * something that costs nothing, at the exact moment someone was deciding
 * whether to sign up.
 *
 * The detail page reasoned this out correctly and the feed rows did not,
 * because the same fact was written twice. It is written once here now, and
 * both read it.
 */
export type TicketGate = 'signin' | 'purchase' | 'subscription';

export function ticketGate(visibility: PredictionVisibility): TicketGate {
  switch (visibility) {
    case 'PUBLIC':
      // Locked only because nobody is signed in. Nothing is for sale.
      return 'signin';
    case 'PREMIUM':
      return 'purchase';
    case 'VIP':
      return 'subscription';
  }
}

/** On a button, where there is room for two words. */
export const GATE_ACTION_KA: Record<TicketGate, string> = {
  signin: 'ავტორიზაცია',
  purchase: 'შეძენით გაიხსნება',
  subscription: 'გამოწერით გაიხსნება',
};

/**
 * Where the pick is withheld and something has to stand in for it. A free
 * prediction behind the sign-in wall is not "closed" - it is free, and
 * calling it closed sells a barrier that is not there.
 */
export const GATE_TITLE_KA: Record<TicketGate, string> = {
  signin: 'უფასო პროგნოზი',
  purchase: 'დახურული პროგნოზი',
  subscription: 'დახურული პროგნოზი',
};

/** In a price column, which is asking what this one costs. */
export const GATE_PRICE_KA: Record<TicketGate, string> = {
  signin: 'უფასო',
  purchase: 'ცალკე',
  subscription: 'გამოწერით',
};

/** On the ticket's own page, where the sentence has room to explain. */
export const GATE_SENTENCE_KA: Record<TicketGate, string> = {
  signin: 'ეს პროგნოზი იხსნება შესვლის შემდეგ, გადახდის გარეშე',
  purchase: 'ეს ბილეთი იხსნება მხოლოდ შეძენით',
  subscription: 'ეს ბილეთი იხსნება მხოლოდ ავტორის გამოწერით',
};
