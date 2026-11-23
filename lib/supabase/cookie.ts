// Hold's own name for the Supabase login cookie.
//
// Hold and Staple share one Supabase project, so by default both would use
// "sb-<project>-auth-token". On localhost that's the same cookie for both
// apps (cookies ignore the port), and logging out of one would log out the
// other. Used by every Supabase client in Hold (lib/supabase/server.ts and
// proxy.ts), so they all read the same login.
export const AUTH_COOKIE_NAME = "hold-auth";

/**
 * Options for every Supabase cookie Hold sets. httpOnly: only the server
 * reads the login (Hold has no browser Supabase client), so page scripts,
 * and anything injected into them, can't steal the tokens. secure: only
 * over HTTPS once deployed (plain http://localhost would drop it).
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
