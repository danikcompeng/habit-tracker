import { describe, expect, it } from "vitest";
import { NO_TAP_HINT, QUICK_RELEASE_MS, nextTapHint, tapHintAnnouncement, type TapHintEvent, type TapHintState } from "./tap-hint";

const TODAY = "2026-11-25";
const release = (habitId = "a", extra: Partial<Extract<TapHintEvent, { type: "release" }>> = {}): TapHintEvent => ({
  type: "release",
  habitId,
  heldMs: 120,
  mode: "hold",
  shownOn: null,
  today: TODAY,
  ...extra,
});

function run(events: TapHintEvent[], start: TapHintState = NO_TAP_HINT) {
  let state = start;
  const shown: boolean[] = [];
  for (const event of events) {
    const step = nextTapHint(state, event);
    state = step.state;
    shown.push(step.shown);
  }
  return { state, shown };
}

describe("the Tap to complete hint", () => {
  it("shows on the second quick release, under the key released second (keys count together)", () => {
    const { state, shown } = run([release("a"), release("b")]);
    expect(shown).toEqual([false, true]);
    expect(state).toEqual({ releases: 0, habitId: "b" });
  });

  it("one quick release isn't enough", () => {
    expect(run([release()]).state).toEqual({ releases: 1, habitId: null });
  });

  it("slow releases (someone learning to hold) don't count, and don't reset the count", () => {
    const slow = release("a", { heldMs: QUICK_RELEASE_MS });
    expect(run([release(), slow, slow]).shown).toEqual([false, false, false]);
    expect(run([release(), slow, release()]).shown).toEqual([false, false, true]);
  });

  it("a completion starts the count again", () => {
    expect(run([release(), { type: "complete" }, release()]).shown).toEqual([false, false, false]);
  });

  it("a completion keeps a shown hint (removing it would move the keys under a finger)", () => {
    const { state } = run([release(), release("b"), { type: "complete" }]);
    expect(state.habitId).toBe("b");
  });

  it("at most once per day: not if it was already shown today", () => {
    const shownToday = { shownOn: TODAY };
    expect(run([release("a", shownToday), release("a", shownToday)]).shown).toEqual([false, false]);
  });

  it("a new day can show it again, and days are compared for equality only", () => {
    expect(run([release("a", { shownOn: "2026-11-24" }), release("a", { shownOn: "2026-11-24" })]).shown).toEqual([false, true]);
    // A time-zone change that makes "today" earlier than the saved day.
    expect(run([release("a", { shownOn: "2026-11-26" }), release("a", { shownOn: "2026-11-26" })]).shown).toEqual([false, true]);
  });

  it("never with Tap to complete on", () => {
    const tap = { mode: "tap" as const };
    expect(run([release("a", tap), release("a", tap), release("a", tap)]).shown).toEqual([false, false, false]);
  });

  it("while it's showing, more releases change nothing", () => {
    const showing = { releases: 0, habitId: "b" };
    expect(nextTapHint(showing, release("a"))).toEqual({ state: showing, shown: false });
  });

  it("a reset (Today hidden, a new day) clears the count and the hint", () => {
    expect(run([release(), { type: "reset" }, release()]).shown).toEqual([false, false, false]);
    expect(run([release(), release(), { type: "reset" }]).state).toEqual(NO_TAP_HINT);
  });

  it("is announced once, in place of Keep holding", () => {
    expect(tapHintAnnouncement("Read 10 pages")).toBe("Keep holding to complete Read 10 pages, or turn on Tap to complete in Settings.");
  });
});
