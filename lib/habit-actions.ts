"use server";
// Adding, renaming, deleting and reordering habits (plans/habit-tracker.md,
// Feature 4). Like setCheckin: every action checks the login, checks its
// input, never throws, and refreshes the page so the screen shows the
// server's truth.

import { refresh } from "next/cache";
import { normalizeHabitName, validateHabitName } from "./habit-name";
import { requireUser } from "./server-helpers";

export type HabitResult =
  | { ok: true; id?: string; name?: string }
  | { ok: false; reason: "invalid" | "gone" | "stale" | "limit" | "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HABITS = 100;

const ERROR: HabitResult = { ok: false, reason: "error", message: "Couldn't save. Check your connection and try again." };
const GONE: HabitResult = { ok: false, reason: "gone", message: "The list changed, so it was refreshed." };

function isId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The tidied name, or the message to show next to the box. */
function checkName(raw: unknown): { name: string } | { message: string } {
  if (typeof raw !== "string") return { message: "Give your habit a name." };
  const name = normalizeHabitName(raw);
  const problem = validateHabitName(name);
  return problem ? { message: problem } : { name };
}

async function run(label: string, body: () => Promise<HabitResult>): Promise<HabitResult> {
  try {
    return await body();
  } catch (error) {
    console.error(`${label} failed:`, error);
    return ERROR;
  }
}

/** Adds a habit at the bottom of the list. */
export async function createHabit(rawName: unknown): Promise<HabitResult> {
  return run("createHabit", async () => {
    const checked = checkName(rawName);
    if ("message" in checked) return { ok: false, reason: "invalid", message: checked.message };
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("habits").insert({ name: checked.name }).select("id").single();
    if (error) {
      // The database's limit (a trigger), so it holds whatever calls it.
      if (error.code === "54000") {
        return { ok: false, reason: "limit", message: `You can have up to ${MAX_HABITS} habits.` };
      }
      console.error("createHabit:", { code: error.code, message: error.message });
      return ERROR;
    }
    refresh();
    return { ok: true, id: data.id as string, name: checked.name };
  });
}

/** Renames one of your habits. Only the name changes. */
export async function renameHabit(id: unknown, rawName: unknown): Promise<HabitResult> {
  return run("renameHabit", async () => {
    if (!isId(id)) return { ok: false, reason: "invalid", message: "That habit couldn't be found." };
    const checked = checkName(rawName);
    if ("message" in checked) return { ok: false, reason: "invalid", message: checked.message };
    const { supabase } = await requireUser();
    // .select("id") so we can tell "renamed" from "nothing there to rename".
    const { data, error } = await supabase.from("habits").update({ name: checked.name }).eq("id", id).select("id");
    if (error) {
      console.error("renameHabit:", { code: error.code, message: error.message });
      return ERROR;
    }
    refresh();
    return data.length === 0 ? GONE : { ok: true, id, name: checked.name };
  });
}

/** Deletes one of your habits, and with it its check-ins (streak and history). */
export async function deleteHabit(id: unknown): Promise<HabitResult> {
  return run("deleteHabit", async () => {
    if (!isId(id)) return { ok: false, reason: "invalid", message: "That habit couldn't be found." };
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("habits").delete().eq("id", id).select("id");
    if (error) {
      console.error("deleteHabit:", { code: error.code, message: error.message });
      return ERROR;
    }
    refresh();
    // Already gone (deleted elsewhere, or the demo was reset): say so, as
    // the refreshed list may still show a habit with that name.
    return data.length === 0 ? GONE : { ok: true, id };
  });
}

/**
 * Saves the order of ALL your habits. The database refuses a list that
 * isn't exactly your habits (added or deleted since this screen loaded),
 * changing nothing; then the screen reloads.
 */
export async function reorderHabits(ids: unknown): Promise<HabitResult> {
  return run("reorderHabits", async () => {
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_HABITS ||
      !ids.every(isId) ||
      new Set(ids.map((id: string) => id.toLowerCase())).size !== ids.length
    ) {
      return { ok: false, reason: "invalid", message: "Couldn't save that order. Try again." };
    }
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("reorder_habits", { p_ids: ids });
    if (error) {
      if (error.code === "HR001") {
        refresh();
        return { ok: false, reason: "stale", message: "The list changed, so it was refreshed. Your order wasn't saved." };
      }
      console.error("reorderHabits:", { code: error.code, message: error.message });
      return error.code === "22023" ? { ok: false, reason: "invalid", message: "Couldn't save that order. Try again." } : ERROR;
    }
    refresh();
    return { ok: true };
  });
}

