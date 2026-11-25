// How high you've climbed (plans/habit-tracker.md, Feature 10, "The Climb").
//
// Derived, never stored, like streaks: this is the rule, and the database's
// habit_altitude() is the same rule in SQL (the PGlite tests check they
// agree). Pure: no database, no clock.
//
// The day rules are History's (lib/streaks.ts weekDots): a day is done if
// there's a check-in (back-filled days too, even before the habit's created
// day); otherwise "before" if it's earlier than the created day, "open" if
// it's today, else missed. A past day counts done + missed; today counts
// every habit that isn't "before" (all of them), so the climb grows live.

/**
 * Altitude is kept in whole CENTIMETRES, in both this file and SQL, with the
 * same integer rounding, so the two agree exactly and a zone is never
 * missed by a rounding hair (a third of 100 m is 3,333 cm in both).
 */
export const CM = 100;
/** Centimetres for a day with every counted habit done (100 m)… */
export const DAY_CM = 100 * CM;
/** …plus this for a perfect day (50 m). */
export const PERFECT_BONUS_CM = 50 * CM;
/** Where High ridge starts: Everest's height, a height on the way, never the end (Feature 10b). */
export const HIGH_RIDGE_M = 8_848;

/** A zone of the climb: its name and the height it starts at, in metres. */
export type Zone = { readonly name: string; readonly from: number };

/**
 * The named zones, from the valley up. The climb has no last zone: above
 * these, a new one every 2,500 m, forever (zoneByIndex), so there's always
 * a next zone moment (Feature 10b: a constant journey).
 */
export const ZONES: readonly Zone[] = [
  { name: "Base camp", from: 0 },
  { name: "Forest", from: 500 },
  { name: "Treeline", from: 1_500 },
  { name: "Snowline", from: 3_000 },
  { name: "Above the clouds", from: 5_000 },
  { name: "High ridge", from: HIGH_RIDGE_M },
  // Where the real stratosphere starts at mid-latitudes.
  { name: "Stratosphere", from: 10_000 },
  { name: "Jet stream", from: 12_500 },
  { name: "Thin air", from: 15_000 },
  { name: "Aurora", from: 17_500 },
  { name: "Starlight", from: 20_000 },
  { name: "Silver ridge", from: 22_500 },
  { name: "Moonrise", from: 25_000 },
  { name: "Long ridge", from: 27_500 },
  { name: "Quiet heights", from: 30_000 },
  { name: "Far horizon", from: 32_500 },
  { name: "Deep sky", from: 35_000 },
];

/** Above the named zones: a new zone every this many metres, all called this. */
export const ZONE_STEP_M = 2_500;
export const HIGHER_STILL = "Higher still";

const LAST = ZONES.length - 1;

/** The zone at an index (0 = Base camp), for any index: named, then "Higher still" every 2,500 m. */
export function zoneByIndex(index: number): Zone {
  const i = Math.max(0, Math.floor(index));
  if (i <= LAST) return ZONES[i];
  return { name: HIGHER_STILL, from: ZONES[LAST].from + (i - LAST) * ZONE_STEP_M };
}

/** The zones that start below a height (metres), in order: for labels on the Climb screen. */
export function zonesBelow(metres: number): Zone[] {
  const out: Zone[] = [];
  for (let i = 0; zoneByIndex(i).from < metres; i++) out.push(zoneByIndex(i));
  return out;
}

/**
 * A day's climb in centimetres: the share of counted habits done (rounded
 * half up to the centimetre), plus the bonus when all of them are. The same
 * integer arithmetic as habit_altitude().
 */
export function dailyClimbCm(done: number, counted: number): number {
  if (counted <= 0) return 0;
  return Math.floor((2 * DAY_CM * done + counted) / (2 * counted)) + (done >= counted ? PERFECT_BONUS_CM : 0);
}

/** A habit as the climb sees it: its created day (in the user's time zone) and its check-in days. */
export type ClimbHabit = { createdDay: string; days: Iterable<string> };

/** One day's numbers: habits done, and habits counted. */
export type ClimbDay = { day: string; done: number; counted: number };

/**
 * The days that climb: only days with a check-in (any other day has nothing
 * done, so climbs 0), through `today`. A past day counts the habits made by
 * then plus any back-filled before their habit was made; today counts every
 * habit (done or still open).
 */
export function climbDays(habits: readonly ClimbHabit[], today: string): ClimbDay[] {
  const done = habits.map((h) => new Set([...h.days].filter((d) => d <= today)));
  const days = [...new Set(done.flatMap((set) => [...set]))].sort();
  return days.map((day) => {
    let d = 0;
    let counted = 0;
    habits.forEach((h, i) => {
      const checked = done[i].has(day);
      if (checked) d++;
      if (checked || day === today || h.createdDay <= day) counted++;
    });
    return { day, done: d, counted };
  });
}

/** Altitude in centimetres through `today`, and through yesterday (Today adds today's climb live). */
export function altitudeOf(habits: readonly ClimbHabit[], today: string): { altitudeCm: number; beforeTodayCm: number } {
  let beforeTodayCm = 0;
  let todayCm = 0;
  for (const d of climbDays(habits, today)) {
    const climb = dailyClimbCm(d.done, d.counted);
    if (d.day === today) todayCm = climb;
    else beforeTodayCm += climb;
  }
  return { altitudeCm: beforeTodayCm + todayCm, beforeTodayCm };
}

/** The index of the zone you're in at an altitude (in centimetres). */
export function zoneIndex(altitudeCm: number): number {
  if (altitudeCm >= ZONES[LAST].from * CM) return LAST + Math.floor((altitudeCm - ZONES[LAST].from * CM) / (ZONE_STEP_M * CM));
  let index = 0;
  ZONES.forEach((z, i) => {
    if (altitudeCm >= z.from * CM) index = i;
  });
  return index;
}

/** The zone you're in at an altitude (in centimetres). */
export function zoneAt(altitudeCm: number): Zone {
  return zoneByIndex(zoneIndex(altitudeCm));
}

/** The next zone up and how far it is in whole metres (rounded UP: never "0 m to go" before you're there). There's always one. */
export function nextZone(altitudeCm: number): { zone: Zone; metres: number } {
  const next = zoneByIndex(zoneIndex(altitudeCm) + 1);
  return { zone: next, metres: Math.ceil((next.from * CM - altitudeCm) / CM) };
}

/**
 * A climb from `before` to `after` (centimetres) that enters a zone higher
 * than any already celebrated (`celebrated`, a zone index): the highest such
 * zone, or null. Only upward; a second crossing of the same zone is never news.
 */
export function newZone(before: number, after: number, celebrated: number): Zone | null {
  if (after <= before) return null;
  const reached = zoneIndex(after);
  if (reached <= zoneIndex(before) || reached <= celebrated) return null;
  return zoneByIndex(reached);
}

const METRES = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Whole metres from centimetres, rounded DOWN: a height is shown only once it's reached. */
export function wholeMetres(altitudeCm: number): number {
  return Math.floor(altitudeCm / CM);
}

/** "2,863 m", from centimetres (rounded down). */
export function metres(altitudeCm: number): string {
  return `${METRES.format(wholeMetres(altitudeCm))} m`;
}

/** "1,735 m", a plain number of metres. */
export function metresText(value: number): string {
  return `${METRES.format(value)} m`;
}

// The one-time zone moment (Feature 10): the highest zone celebrated is
// remembered per account on this device. Pure rules here; Today reads and
// writes localStorage.

/** localStorage key: the highest zone celebrated, by its starting height in metres. */
export function zoneMemoryKey(userId: string): string {
  return `climb-zone:${userId}`;
}

/** The zone index a stored value stands for; -1 for nothing stored (or unreadable). */
export function celebratedIndex(stored: string | null): number {
  if (stored === null) return -1;
  const from = Number(stored);
  if (!Number.isFinite(from) || from < 0) return -1;
  const index = zoneIndex(from * CM);
  return zoneByIndex(index).from === from ? index : -1;
}

/** What to store for a zone index. */
export function zoneMemoryValue(index: number): string {
  return String(zoneByIndex(index).from);
}

/**
 * The server's own altitude (saved data, never a guess) raises the memory
 * silently: a zone reached on another device, by a day rolling over, or
 * before this feature never gets a card later for a small step. Returns the
 * index to store, or null to leave it as it is.
 */
export function silentlyRaised(celebrated: number, serverAltitudeCm: number): number | null {
  const reached = zoneIndex(serverAltitudeCm);
  return reached > celebrated ? reached : null;
}

/**
 * After a completion's save comes back: the zone moment to show, and the
 * zone to remember, or null. Only for a save the server took for today
 * (`ok`, not a new day): a refused or failed save never claims a height
 * you don't have, nor uses up the moment. `celebrated` must be read when
 * the answer arrives, before the refreshed data lands (another tab may
 * have written it; the silent raise must not have run yet).
 */
export function zoneMomentAfterSave(
  climb: { beforeCm: number; afterCm: number },
  result: { ok: true; newDay?: boolean } | { ok: false },
  celebrated: number,
): { zone: Zone; store: number } | null {
  if (!result.ok || result.newDay) return null;
  const zone = newZone(climb.beforeCm, climb.afterCm, celebrated);
  return zone ? { zone, store: zoneIndex(zone.from * CM) } : null;
}
