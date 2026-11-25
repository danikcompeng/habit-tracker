// Ascend's own name for the Supabase login cookie.
//
// Ascend and Staple share one Supabase project, so by default both would use
// "sb-<project>-auth-token". On localhost that's the same cookie for both
// apps (cookies ignore the port), and logging out of one would log out the
// other. Used by every Supabase client in Ascend (lib/supabase/server.ts and
// proxy.ts), so they all read the same login.
// "hold-auth" is from when the app was called Hold. It stays: a new name
// would log out every session on the current address. (Moving to the new
// address already logged out sessions from the old one: vercel.app is a
// public suffix, so cookies never cross between the two.)
export const AUTH_COOKIE_NAME = "hold-auth";

/**
 * Options for every Supabase cookie Ascend sets. httpOnly: only the server
 * reads the login (Ascend has no browser Supabase client), so page scripts,
 * and anything injected into them, can't steal the tokens. secure: only
 * over HTTPS once deployed (plain http://localhost would drop it).
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
