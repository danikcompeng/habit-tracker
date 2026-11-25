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

<!-- impeccable:design-map -->
Name: Ascend
Colors: primary: persimmon #B8420E; neutral: bone-paper #F4EFE6; danger: crimson #A1173A; neutral: soot-ink #2A211A; neutral: walnut-muted #6B5E52
Fonts: Bricolage Grotesque (display, headline, stat, title, title-list, lead, body, label)
Spacing: unit 4px, gap 12px, gutter 20px, key-padding 20px, section 28px
Radius: field 16px, key 24px, pill 9999px
North Star: "The Warm Keyboard"
Rules:
- The One Voice Rule. Persimmon means "done" or "the one thing to do now".
- The Tested Pair Rule. Every text pair is 4.5:1 and every mark, edge and ring is 3:1, and `lib/palette.test.ts` proves it.
- The Token-Only Rule. Components use the token classes (`bg-surface`, `text-ink-muted`, `shadow-[…var(--accent-lip)]`); Tailwind's own palette is switched off, so a raw colour can't sneak in.
- The 16 px Floor Rule. Anything you type into is 16 px.
- The 200% Rule. Every screen still fits a 390 px phone with text at 200% (`e2e/text-size.e2e.ts`): rows that hold text and pills wrap (`flex-wrap`) rather than squeeze, and side-by-side groups use rem-sized columns so they stack when text grows. Today's date is short on phones ("Wed, Nov 25", below 40rem, the same format as History's day readout, `shortDayLabel`) and full on wider screens, so the header looks the same every day; if text-only zoom makes the full one too wide there, it shortens rather than wrap.
- The Lip, Not Glow Rule. Depth is a hard edge under the object in a darker shade of itself.
Elevation:
- Key lip: 0 4px 0 var(--surface-sunk)
- Button lip: 0 3px 0 var(--accent-lip | --surface-sunk | --danger-lip)
Don't:
- Don't use purple gradients, glassmorphism, blurred drop shadows or glows.
- Don't use emoji as icons; icons are simple 2 px stroke line drawings.
- Don't nest a card inside a card; separate inside a card with a hairline.
- Don't put grey text on grey, or persimmon text on the key lip.
- Don't use a second typeface, or a font size under 14 px for text people read.
- Don't round the Summit mark, or bring its sharp corners into screens.
Do:
- Do keep 44 × 44 px as the smallest tap target, 48 px for main buttons.
- Do put new colours in `app/globals.css` and `lib/palette.ts` together, with their pair in `lib/palette.test.ts`.
- Do take every timing from `lib/motion.ts` / `--motion-*` (150, 200, 250, 650 ms) and wrap movement in `motion-safe:`.
- Do give every filled button and key a lip in its own darker shade.
- (+1 more)
Map: lib/palette.test.ts
Map: e2e/text-size.e2e.ts
Map: app/globals.css
Map: lib/palette.ts
Map: lib/motion.ts
Full: .impeccable/design-full.md (read a section when you need its detail)
