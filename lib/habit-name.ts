// Habit names: tidied the same way everywhere before they're saved.
//
// The database also checks names (1-60 characters, no spaces at either
// end; see the migration). Anything that passes validateHabitName passes
// that check too: tests/db/habits.db.test.ts checks the two agree.

export const HABIT_NAME_MAX = 60;

/**
 * Every run of whitespace (tabs, new lines, non-breaking spaces...) becomes
 * one plain space, and the ends are trimmed. Control characters go.
 */
export function normalizeHabitName(raw: string): string {
  return raw
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Characters as people count them: an emoji is 1, like the database's char_length. */
export function nameLength(name: string): number {
  return [...name].length;
}

/** Letters, numbers, symbols or punctuation: something you can actually see. */
const VISIBLE = /[\p{L}\p{N}\p{S}\p{P}]/u;

/**
 * Checks an already-normalized name. Returns the message to show, or null
 * if it's fine.
 */
export function validateHabitName(name: string): string | null {
  if (name === "" || !VISIBLE.test(name)) return "Give your habit a name.";
  if (nameLength(name) > HABIT_NAME_MAX) return `Keep it to ${HABIT_NAME_MAX} characters or fewer.`;
  return null;
}
