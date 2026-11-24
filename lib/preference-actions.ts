"use server";
// Switching "Tap to complete" on or off for this device. The server sets
// the cookie (not page scripts), so Safari keeps it as long as it says, and
// nothing in flight can quietly put back the old value.

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { HOLD_MODE_COOKIE } from "./preferences";

export async function setTapToComplete(on: unknown): Promise<void> {
  const store = await cookies();
  if (on === true) {
    store.set(HOLD_MODE_COOKIE, "tap", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  } else {
    store.delete(HOLD_MODE_COOKIE);
  }
  refresh();
}
