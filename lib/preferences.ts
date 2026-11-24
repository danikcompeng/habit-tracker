// Small per-device settings kept in cookies, so the server draws the
// screen right the first time (no flash of the wrong instructions).
// Set by the server (lib/preference-actions.ts), so Safari keeps them.

import type { HoldMode } from "./hold";

/** "tap" when "Tap to complete" is on; missing means hold (the default). */
export const HOLD_MODE_COOKIE = "hold-mode";

export function parseHoldMode(value: string | undefined): HoldMode {
  return value === "tap" ? "tap" : "hold";
}
