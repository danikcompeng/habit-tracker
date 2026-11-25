import { describe, expect, it } from "vitest";
import { NO_TAP_HINT, QUICK_RELEASE_MS, nextTapHint, tapHintAnnouncement, type TapHintEvent, type TapHintState } from "./tap-hint";

const release = (habitId = "a", extra: Partial<Extract<TapHintEvent, { type: "release" }>> = {}): TapHintEvent => ({
  type: "release",
  habitId,
  heldMs: 120,
  mode: "hold",
  heldBefore: false,
  ...extra,
});
const held: TapHintEvent = { type: "complete", held: true };
const tapped: TapHintEvent = { type: "complete", held: false };
const reset: TapHintEvent = { type: "reset" };

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
    expect(state).toEqual({ releases: 0, habitId: "b", held: false });
  });

  it("one quick release isn't enough", () => {
    expect(run([release()]).state).toEqual({ releases: 1, habitId: null, held: false });
  });

  it("slow releases (someone learning to hold) don't count, and don't reset the count", () => {
    const slow = release("a", { heldMs: QUICK_RELEASE_MS });
    expect(run([release(), slow, slow]).shown).toEqual([false, false, false]);
    expect(run([release(), slow, release()]).shown).toEqual([false, false, true]);
  });

  it("any completion starts the count again", () => {
    expect(run([release(), tapped, release()]).shown).toEqual([false, false, false]);
    expect(run([release(), held, release()]).shown).toEqual([false, false, false]);
  });

  it("a completion keeps a shown hint, even a real hold (removing it would move the keys under a finger)", () => {
    expect(run([release(), release("b"), tapped]).state.habitId).toBe("b");
    expect(run([release(), release("b"), held]).state.habitId).toBe("b");
  });

  it("every visit can show it again until a real hold", () => {
    expect(run([release(), release(), reset, release(), release()]).shown).toEqual([false, true, false, false, true]);
  });

  it("never once this device has held (the saved flag)", () => {
    const before = { heldBefore: true };
    expect(run([release("a", before), release("a", before), release("a", before)]).shown).toEqual([false, false, false]);
  });

  it("never after a real hold on this page, even without the saved flag (blocked storage), and through a reset", () => {
    expect(run([held, release(), release()]).shown).toEqual([false, false, false]);
    expect(run([held, reset, release(), release()]).shown).toEqual([false, false, false, false]);
  });

  it("shown, then a real hold while it shows: it stays this visit, and never comes back", () => {
    expect(run([release(), release(), held, reset, release(), release()]).shown).toEqual([false, true, false, false, false, false]);
  });

  it("a completion that wasn't a hold (Tap to complete, VoiceOver) doesn't stop it", () => {
    expect(run([tapped, release(), release()]).shown).toEqual([false, false, true]);
  });

  it("never with Tap to complete on", () => {
    const tap = { mode: "tap" as const };
    expect(run([release("a", tap), release("a", tap), release("a", tap)]).shown).toEqual([false, false, false]);
  });

  it("while it's showing, more releases change nothing", () => {
    const showing = { releases: 0, habitId: "b", held: false };
    expect(nextTapHint(showing, release("a"))).toEqual({ state: showing, shown: false });
  });

  it("a reset (Today hidden) clears the count and the hint", () => {
    expect(run([release(), reset, release()]).shown).toEqual([false, false, false]);
    expect(run([release(), release(), reset]).state).toEqual(NO_TAP_HINT);
  });

  it("is announced once, in place of Keep holding", () => {
    expect(tapHintAnnouncement("Read 10 pages")).toBe("Keep holding to complete Read 10 pages, or turn on Tap to complete in Settings.");
  });
});
