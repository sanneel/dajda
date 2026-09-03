/**
 * The balance ledger's currency.
 *
 * There is no customer top-up any more: money enters only as a card payment
 * for a subscription or a ticket, and the balance that remains is the
 * author's earnings ledger (see ./ledger.ts), credited by verified payments
 * and drawn down by payouts. It is held in GEL and nothing else.
 */
export const BALANCE_CURRENCY = 'GEL';
