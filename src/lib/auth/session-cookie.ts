/**
 * The session cookie's name. Its own module so the proxy can check for the
 * cookie without importing the session code, which reaches the database.
 */
export const SESSION_COOKIE = 'dajda_session';
