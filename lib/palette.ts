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
    "accent-tint": "#E9B79A", // the hold fill while pressing (1.8:1 against the key)
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
    "accent-tint": "#7A4228", // the hold fill (2.0:1 against the key)
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
  // Not ink-muted on accent-tint (3.5:1 light): while a key is held, its
  // grey streak caption turns ink (components/habit-key.tsx).
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
  ["accent", "accent-tint"], // done and today dots under the hold fill
  ["ink-muted", "accent-tint"], // missed dots and the empty check ring under the hold fill
  // (Not the faint "before" dots, ink-muted at 35%: decorative, 1.5:1 on the fill, 1.7 on the key.)
  ["accent-key", "surface"], // History: a day with every habit done, on the chart card
  ["accent-soft", "surface"], // History: a day with some habits done, on the chart card
  ["ink-muted", "surface-sunk"], // unavailable arrows are ink-muted at lower opacity: never below this
  ["ink-muted", "background"], // edge of a text box, so you can find it
  ["danger", "surface"], // edge of a text box with an error
];

/**
 * The hold fill against the key it grows over. It's the progress of the
 * main gesture, so it must be clearly visible, but it can't reach 3:1
 * without becoming nearly as strong as a done key (and losing the text on
 * it). Raised from 1.3 to 1.8 (light) and 1.4 to 2.0 (dark) on 2026-11-24.
 */
export const HOLD_FILL_MIN_CONTRAST = 1.75;

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

/**
 * The Climb's pixel-art scene (Feature 10): one colour per role the scene
 * draws (lib/climb-scene/scene.ts ROLES), light and dark. Never text: the
 * scene's words sit in token chips. The marker is the accent, on a ring that
 * keeps it 3:1 against whatever it stands on (lib/palette.test.ts).
 */
export const SCENE_PALETTE: Record<Mode, Record<string, string>> = {
  light: {
    "sky-1": "#4E72A6",
    "sky-2": "#5A7DB0",
    "sky-3": "#6D8FBE",
    "sky-4": "#7D9DC8",
    "sky-5": "#90AFD5",
    "sky-6": "#A2BDDD",
    "sky-7": "#B5CCE5",
    "sky-8": "#C6D7EA",
    "sky-9": "#D7E3EE",
    "sky-10": "#E3E9EE",
    "sky-11": "#ECECE8",
    "sky-12": "#F2EEE3",
    "star": "#FFFFFF",
    "star-dim": "#DDE3F0",
    "moon": "#F2C14E",
    "moon-shade": "#D9A940",
    "moon-glow": "#E8D9A8",
    "moon-glow-2": "#F0E6C8",
    "bank-far": "#EFEDE6",
    "bank-far-light": "#FBFAF6",
    "bank-near": "#F7F5EF",
    "bank-near-light": "#FFFFFF",
    "bank-edge": "#FFFFFF",
    "bank-shade": "#D9E2EE",
    "ridge-far": "#A9BBD2",
    "ridge-near": "#93A9C4",
    "rock": "#8F9DB3",
    "rock-shade": "#6F7F99",
    "snow": "#F7F9FC",
    "snow-shade": "#CFDAE8",
    "snow-gully": "#AFBDD3",
    "pine": "#4F8B5E",
    "pine-dark": "#3C6F4B",
    "valley": "#93C26F",
    "valley-dark": "#7BAA5C",
    "lake": "#5D9ED3",
    "lake-light": "#A9D2F0",
    "cloud": "#DDE5F2",
    "cloud-light": "#FFFFFF",
    "cloud-shade": "#C3D0E6",
    "cloud-deep": "#A9B9D8",
    "cloud-far": "#CFDCEB",
    "cloud-far-shade": "#BCCBE0",
    "cirrus": "#E9EFF6",
    "rim": "#FFFFFF",
    "marker": "#B8420E",
    "marker-ring": "#FFFFFF",
    "marker-edge": "#2A211A",
    ruler: "#FFFFFF",
  },
  dark: {
    "sky-1": "#050A1C",
    "sky-2": "#070D23",
    "sky-3": "#09112B",
    "sky-4": "#0C1533",
    "sky-5": "#0F1A3B",
    "sky-6": "#121F44",
    "sky-7": "#15244C",
    "sky-8": "#182955",
    "sky-9": "#1B2E5D",
    "sky-10": "#1E3365",
    "sky-11": "#22386D",
    "sky-12": "#263D75",
    "star": "#F4F7FF",
    "star-dim": "#8FA0D0",
    "moon": "#F4C55A",
    "moon-shade": "#D9A940",
    "moon-glow": "#1F2C5E",
    "moon-glow-2": "#16224D",
    "bank-far": "#17244B",
    "bank-far-light": "#22336A",
    "bank-near": "#1E2E5C",
    "bank-near-light": "#3A4F8C",
    "bank-edge": "#8F9EC4",
    "bank-shade": "#121C3E",
    "ridge-far": "#1A2650",
    "ridge-near": "#22305E",
    "rock": "#39466F",
    "rock-shade": "#2A355A",
    "snow": "#9AA7CF",
    "snow-shade": "#6A79A6",
    "snow-gully": "#56648F",
    "pine": "#1F3B4C",
    "pine-dark": "#172E3C",
    "valley": "#1F3647",
    "valley-dark": "#192D3B",
    "lake": "#2C4C7E",
    "lake-light": "#F4C55A",
    "cloud": "#5C6B92",
    "cloud-light": "#8F9EC4",
    "cloud-shade": "#424F76",
    "cloud-deep": "#313D62",
    "cloud-far": "#3A4772",
    "cloud-far-shade": "#2D3961",
    "cirrus": "#2E3D6E",
    "rim": "#FF9F7C",
    "marker": "#FF8F57",
    "marker-ring": "#050A1C",
    "marker-edge": "#F4F7FF",
    ruler: "#8F9EC4",
  },
};

/** Everything the marker can stand on or in front of. */
export const SCENE_BACKDROPS = [
  "sky-1",
  "sky-2",
  "sky-3",
  "sky-4",
  "sky-5",
  "sky-6",
  "sky-7",
  "sky-8",
  "sky-9",
  "sky-10",
  "sky-11",
  "sky-12",
  "star",
  "star-dim",
  "moon-glow",
  "moon-glow-2",
  "bank-far",
  "bank-far-light",
  "bank-near",
  "bank-near-light",
  "bank-edge",
  "bank-shade",
  "ridge-far",
  "ridge-near",
  "rock",
  "rock-shade",
  "snow",
  "snow-shade",
  "snow-gully",
  "pine",
  "pine-dark",
  "valley",
  "valley-dark",
  "lake",
  "lake-light",
  "cloud",
  "cloud-light",
  "cloud-shade",
  "cloud-deep",
  "cloud-far",
  "cloud-far-shade",
  "cirrus",
  "rim",
] as const;
