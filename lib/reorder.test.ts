import { describe, expect, it } from "vitest";
import { move, reconcile, sameOrder, visibleOrder } from "./reorder";

describe("move", () => {
  const list = ["a", "b", "c", "d"];
  it("moves to the start, the end, and one place", () => {
    expect(move(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(move(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(move(list, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });
  it("leaves the list alone for the same place or a bad index, and never mutates", () => {
    expect(move(list, 2, 2)).toEqual(list);
    expect(move(list, 9, 0)).toEqual(list);
    expect(move(list, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});

describe("reconcile", () => {
  it("keeps the order on screen when nothing changed", () => {
    expect(reconcile(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });
  it("drops habits deleted elsewhere", () => {
    expect(reconcile(["c", "a", "b"], ["a", "c"])).toEqual(["c", "a"]);
  });
  it("adds new habits at the end, in the server's order", () => {
    expect(reconcile(["b", "a"], ["a", "b", "x", "y"])).toEqual(["b", "a", "x", "y"]);
  });
  it("handles both at once, and an empty screen", () => {
    expect(reconcile(["c", "a", "b"], ["a", "c", "z"])).toEqual(["c", "a", "z"]);
    expect(reconcile([], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("sameOrder", () => {
  it("compares order, not just membership", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});

describe("visibleOrder", () => {
  const server = ["a", "b", "c"];
  const local = ["c", "a", "b"];
  const idle = { arranging: false, dirty: false, saving: false };

  it("shows the server's order when nothing is pending", () => {
    expect(visibleOrder(local, server, idle)).toEqual(server);
  });
  it("keeps the order on screen while arranging, while a save waits, and while it's sent", () => {
    expect(visibleOrder(local, server, { ...idle, arranging: true })).toEqual(local);
    expect(visibleOrder(local, server, { ...idle, dirty: true })).toEqual(local);
    // "Done arranging" then the save in flight: no snap back to the old order.
    expect(visibleOrder(local, server, { ...idle, saving: true })).toEqual(local);
  });
  it("still reconciles with the server while pending (added or deleted elsewhere)", () => {
    expect(visibleOrder(local, ["a", "c", "z"], { ...idle, saving: true })).toEqual(["c", "a", "z"]);
  });
});
