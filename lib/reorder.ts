// The order maths for arranging habits (plans/habit-tracker.md, Feature 4).
// Orders are always FULL lists of ids, never "moves": a list can be
// re-applied on top of fresh server data without going wrong.

/** A copy of `list` with the item at `from` moved to `to` (both clamped to the list). */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const result = [...list];
  if (from < 0 || from >= result.length) return result;
  const target = Math.max(0, Math.min(result.length - 1, to));
  const [item] = result.splice(from, 1);
  result.splice(target, 0, item);
  return result;
}

/**
 * The order on screen, brought in line with the server's set of habits:
 * ids the server no longer has are dropped, and ids it has that the screen
 * doesn't know yet (added elsewhere, or an add that just finished) go at
 * the end, in the server's order. So a saved list always names exactly the
 * habits that exist, which is what reorder_habits insists on.
 */
export function reconcile(local: readonly string[], server: readonly string[]): string[] {
  const known = new Set(server);
  const kept = local.filter((id) => known.has(id));
  const seen = new Set(kept);
  return [...kept, ...server.filter((id) => !seen.has(id))];
}

/** Same ids in the same order? */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Which order the list shows. The order on screen (`local`) wins while
 * you're arranging AND until your save has come back (dirty or saving):
 * showing the server's order in between would snap the list back to the
 * old order for a moment, and arranging again from it would quietly undo
 * the last change. Otherwise the server's order.
 */
export function visibleOrder(
  local: readonly string[],
  server: readonly string[],
  state: { arranging: boolean; dirty: boolean; saving: boolean },
): string[] {
  return state.arranging || state.dirty || state.saving ? reconcile(local, server) : [...server];
}
