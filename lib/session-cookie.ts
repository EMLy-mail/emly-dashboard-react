// Cookie names shared by lib/auth.ts and lib/api.ts. Kept apart so api.ts can
// read the session without importing auth.ts, which imports api.ts.
export const SESSION_COOKIE = "emly_session";
