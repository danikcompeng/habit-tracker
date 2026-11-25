---
name: Ascend
description: A habit tracker you press like a physical key.
colors:
  persimmon: "#B8420E"
  persimmon-night: "#FF8F57"
  persimmon-lip: "#8A300A"
  persimmon-lip-night: "#A84F24"
  done-key-night: "#D9733F"
  persimmon-soft: "#CD7A55"
  persimmon-soft-night: "#AD5A2E"
  hold-tint: "#E9B79A"
  hold-tint-night: "#7A4228"
  on-persimmon: "#FFFFFF"
  on-persimmon-night: "#1E120A"
  bone-paper: "#F4EFE6"
  warm-graphite: "#191613"
  key-face: "#FFFDF9"
  key-face-night: "#26221E"
  key-lip: "#EAE3D6"
  key-lip-night: "#120F0D"
  soot-ink: "#2A211A"
  chalk-ink: "#F3ECE2"
  walnut-muted: "#6B5E52"
  walnut-muted-night: "#B4A797"
  hairline: "#E0D8CA"
  hairline-night: "#3A342E"
  crimson: "#A1173A"
  crimson-night: "#FF8FA8"
  crimson-lip: "#6E0F28"
  crimson-lip-night: "#B24A63"
typography:
  display:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "min(3.25rem, 17vw)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  title:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
  title-list:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  lead:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
    fontFeature: "tnum"
rounded:
  field: "16px"
  key: "24px"
  pill: "9999px"
spacing:
  unit: "4px"
  gap: "12px"
  gutter: "20px"
  key-padding: "20px"
  section: "28px"
components:
  habit-key:
    backgroundColor: "{colors.key-face}"
    textColor: "{colors.soot-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.key}"
    padding: "20px"
    height: "96px"
  habit-key-done:
    backgroundColor: "{colors.persimmon}"
    textColor: "{colors.on-persimmon}"
    typography: "{typography.title}"
    rounded: "{rounded.key}"
    padding: "20px"
  button-primary:
    backgroundColor: "{colors.persimmon}"
    textColor: "{colors.on-persimmon}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.key-face}"
    textColor: "{colors.soot-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-secondary-sm:
    backgroundColor: "{colors.key-face}"
    textColor: "{colors.soot-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    textColor: "{colors.walnut-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.crimson}"
    textColor: "{colors.key-face}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  text-field:
    backgroundColor: "{colors.key-face}"
    textColor: "{colors.soot-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "48px"
  list-row:
    backgroundColor: "{colors.key-face}"
    textColor: "{colors.soot-ink}"
    typography: "{typography.title-list}"
    rounded: "{rounded.field}"
    padding: "8px 8px 8px 16px"
    height: "64px"
  range-switch:
    backgroundColor: "{colors.key-lip}"
    textColor: "{colors.walnut-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "4px"
    height: "52px"
---

# Design System: Ascend

<!-- Written by /impeccable document from the code as it stood on 2026-11-24
     (app/globals.css, lib/palette.ts, lib/motion.ts, components/). The plan's
     "Design direction" (plans/habit-tracker.md) is where each decision and its
     reason were made; this file describes the result for anyone adding a screen.
     Light values are the plain token names; "-night" keys are the dark-mode
     values of the same role (app/globals.css swaps them under
     prefers-color-scheme: dark). -->

## Overview

**Creative North Star: "The Warm Keyboard"**

Ascend is a small, physical object on a sheet of bone paper. Every habit is a chunky key: it has a face, a lip along its bottom edge, and it sinks when you press it. Holding it down grows a persimmon tint out from under your finger; when the hold completes the key snaps to solid persimmon with a short pop. The whole system exists to make that one gesture feel honest and satisfying, and everything around the keys stays quiet so they can carry the screen.

The mood is tactile and warm, never clinical: warm paper and soft graphite instead of white and black, one persimmon accent instead of a rainbow of categories, one typeface (Bricolage Grotesque) whose optical sizes keep small labels calm and let titles show character. References are the feel of a mechanical keyboard key, Things 3's restraint (one accent, lots of air) and the bold type of Arc and Teenage Engineering product pages. It is a phone app first: a single 20 px-guttered column, big targets, thumb-height actions.

Copy is short, warm and never guilt-tripping ("Hold to complete", "3-day streak", "Start today").

**Key Characteristics:**
- One accent, persimmon, reserved for "done" and the one main action on a screen.
- Depth by a solid lip under the element, never by blur shadows.
- Pills for buttons, 24 px keys for habits, 16 px for fields and cards.
- Physical motion: things press down 2 px and spring back; nothing loops or moves on its own.
- Dark mode is warm graphite with a lighter persimmon, and shows depth by lightness.

## Colors

A warm two-paper neutral set (bone and graphite) with a single persimmon voice and a crimson that only ever means "danger".

### Primary
- **Persimmon** (light `persimmon`, dark `persimmon-night`): done dots, the primary button, the focus ring, the selected switch. Lighter at night so it doesn't glare.
- **Done-key persimmon** (light `persimmon`, dark `done-key-night`): the face of a completed habit key. In dark it is calmer than the accent, because five full-width keys of the night accent glare in a dark room.
- **Persimmon lip** (`persimmon-lip` / `persimmon-lip-night`): the bottom edge of every persimmon key or button. Darker than the face in both themes: a lip, never a highlight.
- **Hold tint** (`hold-tint` / `hold-tint-night`): the fill that grows under a finger during a hold, about 1.8:1 (light) / 2.0:1 (dark) against the key so the progress is clearly visible (tested floor 1.75:1; a 3:1 fill would be nearly as strong as a done key). Text on it is ink: while a key is held, its grey streak caption turns ink. Dots and rings on it stay at least 3:1.
- **Soft persimmon** (`persimmon-soft` / `persimmon-soft-night`): History only, a day with some (not all) habits done.

### Neutral
- **Bone paper / warm graphite** (`bone-paper` / `warm-graphite`): the page.
- **Key face** (`key-face` / `key-face-night`): habit keys, list rows, cards, text fields, secondary buttons.
- **Key lip** (`key-lip` / `key-lip-night`): the lip under a key, pressed backgrounds, skeletons, the range-switch track.
- **Soot / chalk ink** (`soot-ink` / `chalk-ink`): all primary text.
- **Walnut muted** (`walnut-muted` / `walnut-muted-night`): labels, dates, captions, streak text, field edges and empty rings (it is the 3:1 edge colour as well as the 4.5:1 caption colour).
- **Hairline** (`hairline` / `hairline-night`): borders on rows and cards, dividers. Decorative only: never the only thing that shows a control.

### Danger
- **Crimson** (`crimson` / `crimson-night`, lip `crimson-lip` / `crimson-lip-night`): errors and Delete. Crimson so it never reads as persimmon, and always paired with an icon (alert, or trash).

### Named Rules
**The One Voice Rule.** Persimmon means "done" or "the one thing to do now". A screen has at most one persimmon button; a secondary action that would compete steps back to the key-face style.

**The Tested Pair Rule.** Every text pair is 4.5:1 and every mark, edge and ring is 3:1, and `lib/palette.test.ts` proves it. A new pairing goes into `TEXT_PAIRS` or `NON_TEXT_PAIRS` before it goes on screen. Persimmon text never sits on the key lip (4.3:1 in light).

**The Token-Only Rule.** Components use the token classes (`bg-surface`, `text-ink-muted`, `shadow-[…var(--accent-lip)]`); Tailwind's own palette is switched off, so a raw colour can't sneak in.

## Typography

**Display Font:** Bricolage Grotesque (with ui-sans-serif, system-ui)
**Body Font:** Bricolage Grotesque
**Label Font:** Bricolage Grotesque, tabular figures for every number

**Character:** One variable grotesque with optical sizing: chunky and a little quirky at 34–52 px, calm and even at 14–16 px. The single family keeps the app feeling like one object.

### Hierarchy
- **Display** (800, 52 px, line-height 1, tight tracking): the "Ascend" wordmark on the login screen only. Capped at 17vw so the word still fits a phone at large text sizes.
- **Lead** (400, 18 px, 1.4): the one-line promise under the wordmark, and the error page's explanation.
- **Headline** (700, 34 px, 1.05, tight tracking): page titles ("Today", "Habits", "History").
- **Stat** (700, 28 px, 1.25, tabular): History's three numbers only (`text-stat`).
- **Title** (600, 22 px, 1.2): a habit's name on its key.
- **Title, list** (600, 18 px, 1.35): a habit's name in the Habits list and History rows.
- **Body** (500–600, 16 px): buttons, fields, sentences. 16 px is a floor on inputs so iOS never zooms.
- **Label** (500, 14 px, walnut muted): dates, captions, streaks, legends. Numbers are tabular.

### Named Rules
**The 16 px Floor Rule.** Anything you type into is 16 px. Nothing that must be read is under 14 px.

**The 200% Rule.** Every screen still fits a 390 px phone with text at 200% (`e2e/text-size.e2e.ts`): rows that hold text and pills wrap (`flex-wrap`) rather than squeeze, and side-by-side groups use rem-sized columns so they stack when text grows.

## Layout

A single column, `max-width` 32 rem (28 rem for login and error), with a 20 px gutter on phones and the safe-area insets added top and bottom. The rhythm is a 4 px grid: 12 px between keys and rows, 20 px inside a key, about 28 px from a header to its list, 32 px between History's sections. Headers hold the page title or date on the left and one or two compact pill links on the right; they wrap rather than squeeze when text is zoomed. Account actions (log out, reset demo, the Tap to complete switch) live in a footer pushed to the bottom of the screen, below a hairline.

There are no breakpoints: wider screens get the same column, centred.

## Elevation & Depth

Flat surfaces with **solid lips**, never blurred shadows. A key or filled button sits on a hard `0 Npx 0` shadow in its own darker colour (4 px for habit keys, 3 px for buttons), so it reads as a physical key seen from the front. Pressed, the face moves down 2 px and the lip shrinks (to 2 px on keys, 1 px on buttons), so the bottom edge stays put and the key sinks. With Reduce Motion the face doesn't move but the lip still shrinks: that's state, not motion. In dark mode there is no lift at all beyond the lip; layers separate by lightness (page < surface).

### Shadow Vocabulary
- **Key lip** (`box-shadow: 0 4px 0 var(--surface-sunk)`, done `0 4px 0 var(--accent-lip)`): habit keys at rest.
- **Button lip** (`box-shadow: 0 3px 0 var(--accent-lip | --surface-sunk | --danger-lip)`): primary, secondary and danger buttons.

### Named Rules
**The Lip, Not Glow Rule.** Depth is a hard edge under the object in a darker shade of itself. No blur, no glow, no glass.

## Shapes

Soft, keycap geometry. Habit keys and empty-state boxes are 24 px round; text fields, list rows and History cards are 16 px; every button, chip and switch is a full pill. The one deliberate exception is the **Summit** brand mark (a bone mountain with a trail cut up its face on a persimmon field), whose sharp corners are never rounded, and whose sharpness is never copied into screens.

## Components

### Habit key (signature)
- **Character:** the heaviest object on the screen; the thing you press.
- **Shape:** full width, at least 96 px tall, 24 px corners, 20 px padding, a 1 px hairline border.
- **At rest:** key face with the key lip; the name at Title size; an empty 32 px ring (walnut muted) top right; a row of seven 10 px dots and the streak caption along the bottom.
- **Holding:** a hold-tint circle grows from the touch point over 650 ms, linear; let go early and it shrinks back in 150 ms. The streak caption is ink while the fill is on the key. "Keep holding…" replaces the dots if you let go too soon.
- **Done:** snaps (no fade) to done-key persimmon with on-persimmon text, a persimmon lip, a filled check that draws in, scale 1 → 1.03 → 1 over 250 ms, one short vibration. Undo fades back over 200 ms.
- **Reduce Motion:** no circle and no scale; the tint fades in over the same 650 ms, from about a third so the press shows at once, and done/undone change instantly.

### Buttons
- **Shape:** pills, 48 px (`md`) or 44 px (`sm`, header pills), full width only when they are the main action.
- **Primary:** persimmon with on-persimmon text on a 3 px persimmon lip.
- **Secondary:** key face, hairline border, ink text, 3 px key-lip lip.
- **Ghost:** walnut text, no lip; pressed it gets a key-lip background so touch still answers.
- **Danger:** crimson with key-face text, crimson lip, always with the trash icon.
- **Order:** the action comes first (Save | Cancel), except in a destructive confirmation, where the safe choice comes first (Keep it | Delete) so it sits where the thumb already is. While a confirmation is open, the buttons around it step back (dimmed, inactive, full strength again when focused); text fields stay at full contrast.
- **Large text:** labels wrap inside the pill rather than spill out; rows of pills wrap first.
- **Busy:** `aria-disabled`, full colour and focus kept, label changes ("Sending…", "Saving…").

### Text fields
- **Style:** key face, 1 px walnut-muted edge (3:1, so it can be found), 16 px corners, 48 px tall, 16 px text; the label sits above in Label style.
- **Focus:** the global persimmon ring, 2 px, 3 px outside.
- **Error:** edge turns crimson and an alert-icon message appears below, tied by `aria-describedby` and announced. Focus moves back to the field, and its focus ring is crimson too.

### Lists and cards
- **Habits list row:** key face, hairline border, 16 px corners, 64 px tall; name at list-title size, a 44 px icon button (pencil, or up/down arrows while arranging). The editor opens inside the row under a hairline, never as a card on a card.
- **History card:** key face, hairline border, 16 px corners, 20 px padding; holds the chart, legend and summary.

### Range switch (History)
- A key-lip pill track with three equal segments; the selected segment is a key-face pill with a walnut-muted edge (the edge carries the state at 3:1).

### Dots
- 10 px on Today and at 7 days (7 px at 30/90 days). Done is filled persimmon; missed is a walnut-muted ring; today-still-open is a persimmon ring; days before the habit existed are a tiny faint dot. On a done key they turn on-persimmon. Always paired with a sentence for screen readers.

### Focus
- One focus ring everywhere: 2 px persimmon, 3 px outside the element (6 px on habit keys), so it sits on the page.
- The one exception: a field marked invalid keeps crimson when focused, so a persimmon ring never wraps a crimson edge.

## Do's and Don'ts

### Do:
- **Do** keep 44 × 44 px as the smallest tap target, 48 px for main buttons.
- **Do** put new colours in `app/globals.css` and `lib/palette.ts` together, with their pair in `lib/palette.test.ts`.
- **Do** take every timing from `lib/motion.ts` / `--motion-*` (150, 200, 250, 650 ms) and wrap movement in `motion-safe:`.
- **Do** give every filled button and key a lip in its own darker shade.
- **Do** pair colour with a second signal: an icon for errors and delete, an edge for selected states, words for dots.

### Don't:
- **Don't** use purple gradients, glassmorphism, blurred drop shadows or glows.
- **Don't** use emoji as icons; icons are simple 2 px stroke line drawings.
- **Don't** nest a card inside a card; separate inside a card with a hairline.
- **Don't** put grey text on grey, or persimmon text on the key lip.
- **Don't** use a second typeface, or a font size under 14 px for text people read.
- **Don't** round the Summit mark, or bring its sharp corners into screens.
