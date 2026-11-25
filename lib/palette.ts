// Ascend's colours, light and dark (plans/habit-tracker.md, Design direction).
//
// app/globals.css holds the same values as CSS variables, which is what
// the screens use. This file exists so the colours can be tested:
// lib/palette.test.ts checks every pairing used on screen meets WCAG
// contrast (4.5:1 for text, 3:1 for dots, borders and focus rings), and
// that globals.css still matches these values.
//
// Hex is allowed only here and in globals.css (and in the app icon / status
// bar colours, which must be plain values).

export type ColorRole =
  | "background"
  | "surface"
  | "surface-sunk"
  | "ink"
  | "ink-muted"
  | "line"
  | "accent"
  | "on-accent"
  | "accent-tint"
  | "accent-lip"
  | "accent-key"
  | "accent-soft"
  | "danger"
  | "danger-lip";

export type Mode = "light" | "dark";

export const PALETTE: Record<Mode, Record<ColorRole, string>> = {
  light: {
    background: "#F4EFE6", // bone paper
    surface: "#FFFDF9", // habit rows, sheets, inputs
    "surface-sunk": "#EAE3D6", // the key's lip, pressed state, empty tracks
    ink: "#2A211A",
    "ink-muted": "#6B5E52",
    line: "#E0D8CA",
    accent: "#B8420E", // persimmon
    "on-accent": "#FFFFFF",
    "accent-tint": "#F6D9C8", // the hold fill while pressing
    "accent-lip": "#8A300A", // the darker bottom edge of a persimmon key
    "accent-key": "#B8420E", // a done habit key: the accent itself in light
    "accent-soft": "#CD7A55", // History: a day with some (not all) habits done
    danger: "#A1173A", // crimson, kept apart from persimmon
    "danger-lip": "#6E0F28", // the darker bottom edge of a Delete button
  },
  dark: {
    background: "#191613", // warm graphite, never pure black
    surface: "#26221E",
    "surface-sunk": "#120F0D",
    ink: "#F3ECE2",
    "ink-muted": "#B4A797",
    line: "#3A342E",
    accent: "#FF8F57", // lighter persimmon so it doesn't glare at night
    "on-accent": "#1E120A",
    "accent-tint": "#5A3220",
    "accent-lip": "#A84F24", // darker than the done key in dark mode too: a lip, never a highlight
    // A done key in dark: calmer than the accent. Five full-width keys of
    // #FF8F57 glare in a dark room; dots, rings and buttons keep the accent.
    "accent-key": "#D9733F",
    // Partly done days on History: softer than the done-key colour, still 3:1 on the card.
    "accent-soft": "#AD5A2E",
    danger: "#FF8FA8",
    "danger-lip": "#B24A63",
  },
};

/**
 * Text that appears on screen, and what it sits on. Each must be 4.5:1.
 * Not here on purpose: accent text on surface-sunk (4.3:1 in light), so
 * never put accent-coloured text on a sunk background.
 */
export const TEXT_PAIRS: readonly [text: ColorRole, on: ColorRole][] = [
  ["ink", "background"],
  ["ink", "surface"],
  ["ink", "accent-tint"],
  ["ink-muted", "background"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-sunk"],
  ["ink-muted", "accent-tint"],
  ["accent", "background"],
  ["accent", "surface"],
  ["on-accent", "accent"],
  ["on-accent", "accent-key"], // names and streaks on a done key
  ["danger", "background"],
  ["danger", "surface"],
  ["surface", "danger"], // the Delete button: light text on crimson
];

/** Dots, icons and focus rings, and what they sit on. Each must be 3:1. */
export const NON_TEXT_PAIRS: readonly [mark: ColorRole, on: ColorRole][] = [
  ["accent", "surface"], // done dot on a row
  ["accent", "background"], // focus ring (drawn just outside the element, on the page)
  ["ink-muted", "surface"], // missed / today rings on a row
  ["on-accent", "accent"], // dots and check on a done row
  ["on-accent", "accent-key"], // dots and check on a done key
  ["accent-key", "background"], // a done key against the page
  ["accent-key", "surface"], // History: a day with every habit done, on the chart card
  ["accent-soft", "surface"], // History: a day with some habits done, on the chart card
  ["ink-muted", "surface-sunk"], // unavailable arrows are ink-muted at lower opacity: never below this
  ["ink-muted", "background"], // edge of a text box, so you can find it
  ["danger", "surface"], // edge of a text box with an error
];

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#RRGGBB" colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
