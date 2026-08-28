/**
 * Where the chosen theme is remembered.
 *
 * A module of its own so that both sides can read it: the boot script is a
 * server component that reads the CSP nonce from `next/headers`, and importing
 * that file from a client component would drag a server-only API into the
 * browser bundle.
 */
export const THEME_STORAGE_KEY = 'dajda-theme';
