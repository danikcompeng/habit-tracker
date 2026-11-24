"use client";

// /habits: add, rename, reorder and delete (plans/habit-tracker.md,
// Feature 4). Reordering is an "Arrange" mode with up and down buttons on
// every row (plus Move to top / bottom in the editor): the same for touch,
// keyboard, VoiceOver and Switch Control.
//
// Order rules (lib/reorder.ts): the order on screen is a full list of ids.
// A move changes it at once and it's saved as one request; until that save
// has come back, the screen keeps showing it (visibleOrder), so the list
// never snaps back to the old order.

import { startTransition, useEffect, useLayoutEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HabitEditor } from "@/components/habits/habit-editor";
import { AlertIcon, ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { TextField } from "@/components/ui/text-field";
import { createHabit, reorderHabits, type HabitResult } from "@/lib/habit-actions";
import { HABIT_NAME_MAX, nameLength, normalizeHabitName } from "@/lib/habit-name";
import { EASE_OUT, MOTION } from "@/lib/motion";
import { move, visibleOrder } from "@/lib/reorder";

type Habit = { id: string; name: string };
type Notice = { tone: "info" | "error"; text: string; id: number };

/** Wait this long after the last arrange tap, then save the whole order once. */
const SAVE_ORDER_AFTER_MS = 600;
const UNREACHABLE: HabitResult = { ok: false, reason: "error", message: "Couldn't save. Check your connection and try again." };

async function safely(call: () => Promise<HabitResult>): Promise<HabitResult> {
  try {
    return await call();
  } catch {
    // Offline, or the app was updated since this page loaded.
    return UNREACHABLE;
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HabitsManager({ habits }: { habits: Habit[] }) {
  const router = useRouter();
  const serverIds = habits.map((h) => h.id);
  const byId = new Map(habits.map((h) => [h.id, h]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, startSavingOrder] = useTransition();
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const order = visibleOrder(localOrder, serverIds, { arranging, dirty: orderDirty, saving: savingOrder });
  const orderPending = orderDirty || savingOrder;

  // Latest values for timers and cleanups.
  const latest = useRef({ order, serverIds });
  useEffect(() => {
    latest.current = { order, serverIds };
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // After React has moved rows: put focus back (moving a focused row drops
  // focus), and slide the rows from where they were (FLIP).
  const focusAfter = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const slideFrom = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    if (slideFrom.current) {
      const from = slideFrom.current;
      slideFrom.current = null;
      if (!prefersReducedMotion()) {
        for (const [id, el] of rowRefs.current) {
          const before = from.get(id);
          const delta = before === undefined ? 0 : before - el.getBoundingClientRect().top;
          if (delta) el.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: MOTION.fast, easing: EASE_OUT });
        }
      }
    }
    if (focusAfter.current) {
      document.querySelector<HTMLElement>(focusAfter.current)?.focus();
      focusAfter.current = null;
    }
  });

  function say(text: string) {
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }
  /** Something worked: clear an old problem message, and announce it. */
  function succeeded(text: string) {
    setNotice(null);
    say(text);
  }
  function show(result: HabitResult) {
    if (result.ok) return;
    const tone = result.reason === "stale" || result.reason === "gone" ? "info" : "error";
    setNotice({ tone, text: result.message, id: Date.now() });
    if (tone === "info") say(result.message);
    // A failure means "stay here and see it", even after tapping Done.
    setLeaving(false);
    // The answer may have been lost after the save worked: show what's really saved.
    if (result.reason === "error") router.refresh();
  }

  /** Saves an order now: `ids` if given (a move just made), else what's on screen. */
  function saveOrder(ids?: string[]) {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const toSave = ids ?? latest.current.order;
    setOrderDirty(false);
    startSavingOrder(async () => {
      const result = await safely(() => reorderHabits(toSave));
      // Together with the refreshed list, so nothing flashes in between.
      startTransition(() => {
        if (!result.ok) {
          show(result);
          // Start again from what the server has.
          setLocalOrder(latest.current.serverIds);
        }
      });
    });
  }

  // Leaving the page (Next keeps it alive, hidden): save any pending order
  // and close panels, so coming back never shows a stale editor.
  useLayoutEffect(() => {
    return () => {
      if (saveTimer.current) saveOrder();
      setEditingId(null);
      setArranging(false);
      setNotice(null);
      setLeaving(false);
    };
    // Runs only when the page is hidden or removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Done" waits for saves, so Today never shows the old order. A failed
  // save clears `leaving` (in show()), so you stay and see why.
  useEffect(() => {
    if (leaving && !savingOrder && !adding && !orderDirty) router.push("/");
  }, [leaving, savingOrder, adding, orderDirty, router]);

  /** Changes the order on screen (with a slide and focus kept), and saves it. */
  function reorder(next: string[], focusSelector: string, announcementText: string, saveNow: boolean) {
    slideFrom.current = new Map([...rowRefs.current].map(([id, el]) => [id, el.getBoundingClientRect().top]));
    focusAfter.current = focusSelector;
    setLocalOrder(next);
    setOrderDirty(true);
    succeeded(announcementText);
    if (saveNow) saveOrder(next);
    else {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveOrder(), SAVE_ORDER_AFTER_MS);
    }
  }

  function arrangeMove(id: string, direction: "up" | "down") {
    const index = order.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    const name = byId.get(id)?.name ?? "";
    if (target < 0) return say(`${name} is already first.`);
    if (target >= order.length) return say(`${name} is already last.`);
    reorder(move(order, index, target), `[data-move="${id}-${direction}"]`, `${name}, position ${target + 1} of ${order.length}.`, false);
  }

  function editorMove(id: string, where: "top" | "bottom") {
    const index = order.indexOf(id);
    const next = move(order, index, where === "top" ? 0 : order.length - 1);
    reorder(next, `[data-move="${id}-${where}"]`, `Moved ${byId.get(id)?.name} to the ${where}.`, true);
  }

  /** After a habit disappears: focus the next row's Edit, else the previous, else New habit. */
  function focusAfterRemoving(id: string) {
    const index = order.indexOf(id);
    const nextId = order[index + 1] ?? order[index - 1];
    focusAfter.current = nextId ? `[data-edit="${nextId}"]` : "#new-habit";
  }

  return (
    <>
      <header className="flex min-h-12 items-center justify-between gap-3">
        <h1 className="text-title font-bold tracking-tight">Habits</h1>
        {/* Hidden while arranging: "Done arranging" is the one way out of that mode. */}
        {!arranging && (
        <Button
          variant="secondary"
          size="sm"
          block={false}
          busy={leaving}
          onClick={() => {
            if (saveTimer.current) saveOrder();
            if (savingOrder || adding || orderDirty || saveTimer.current) setLeaving(true);
            else router.push("/");
          }}
          className="min-w-24"
        >
          {leaving ? "Saving…" : "Done"}
        </Button>
        )}
      </header>

      <AddHabit
        count={habits.length}
        blocked={arranging || orderPending ? "Finish arranging first, then add." : null}
        quiet={editingId !== null}
        onAddingChange={setAdding}
        onAdded={(name, total) => succeeded(`Added ${name}. ${total} ${total === 1 ? "habit" : "habits"}.`)}
        onProblem={show}
      />

      {notice && (
        <div key={notice.id} className="mt-5">
          {notice.tone === "error" ? <ErrorText>{notice.text}</ErrorText> : <p className="text-sm font-medium text-ink">{notice.text}</p>}
        </div>
      )}

      {habits.length === 0 && !arranging ? (
        <p className="mt-7 text-base text-ink-muted">No habits yet. Add one above.</p>
      ) : (
        <>
          <div className="mt-8 flex min-h-11 items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink-muted" id="list-hint">
              {arranging ? "Use the arrows to change the order." : "Same order as Today."}
            </p>
            {arranging ? (
              // Always shown while arranging, so there's always a way out.
              <Button
                id="arrange"
                size="sm"
                block={false}
                onClick={() => {
                  if (saveTimer.current) saveOrder();
                  setArranging(false);
                  focusAfter.current = "#arrange";
                }}
              >
                Done arranging
              </Button>
            ) : (
              habits.length > 1 && (
                <Button
                  id="arrange"
                  variant="secondary"
                  size="sm"
                  block={false}
                  busy={adding}
                  onClick={() => {
                    // Start from what's on screen (which may be a save still on its way).
                    setLocalOrder(order);
                    setEditingId(null);
                    setArranging(true);
                    focusAfter.current = "#arrange";
                  }}
                >
                  Arrange
                </Button>
              )
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-3" aria-label="Your habits" aria-describedby="list-hint">
            {order.map((id, index) => {
              const habit = byId.get(id);
              if (!habit) return null;
              const editing = editingId === id;
              return (
                <li
                  key={id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(id, el);
                    else rowRefs.current.delete(id);
                  }}
                  className="overflow-hidden rounded-(--radius-field) border border-line bg-surface"
                >
                  <div className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
                    <span className="flex-1 py-1 text-list font-semibold text-pretty text-ink">{habit.name}</span>
                    {arranging ? (
                      <>
                        <IconButton label={`Move ${habit.name} up`} data-move={`${id}-up`} unavailable={index === 0} onClick={() => arrangeMove(id, "up")}>
                          <ArrowUpIcon />
                        </IconButton>
                        <IconButton
                          label={`Move ${habit.name} down`}
                          data-move={`${id}-down`}
                          unavailable={index === order.length - 1}
                          onClick={() => arrangeMove(id, "down")}
                        >
                          <ArrowDownIcon />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        label={`Edit ${habit.name}`}
                        data-edit={id}
                        aria-expanded={editing}
                        aria-controls={editing ? `editor-${id}` : undefined}
                        onClick={() => setEditingId(editing ? null : id)}
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                  </div>
                  {editing && (
                    <div id={`editor-${id}`}>
                      <HabitEditor
                        habit={habit}
                        isFirst={index === 0}
                        isLast={index === order.length - 1}
                        onClose={(focusEdit) => {
                          setEditingId(null);
                          if (focusEdit) focusAfter.current = `[data-edit="${id}"]`;
                        }}
                        onMove={(where) => editorMove(id, where)}
                        onRenamed={(name) => succeeded(`Renamed to ${name}.`)}
                        onDeleted={() => {
                          focusAfterRemoving(id);
                          setEditingId(null);
                          succeeded(`Deleted ${habit.name}.`);
                        }}
                        onGone={(message) => {
                          focusAfterRemoving(id);
                          setEditingId(null);
                          show({ ok: false, reason: "gone", message });
                        }}
                        onUnreachable={() => router.refresh()}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function IconButton({
  label,
  unavailable,
  onClick,
  children,
  ...rest
}: {
  label: string;
  unavailable?: boolean;
  onClick: () => void;
  children: ReactNode;
} & Record<`data-${string}` | `aria-${string}`, unknown>) {
  return (
    <button
      type="button"
      aria-label={label}
      // Stays in place when it can't move further (instead of vanishing
      // while focused); pressing it says why nothing happened.
      aria-disabled={unavailable || undefined}
      onClick={onClick}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink active:bg-surface-sunk active:text-ink aria-disabled:opacity-35 aria-disabled:hover:text-ink-muted aria-disabled:active:bg-transparent"
      {...rest}
    >
      {children}
    </button>
  );
}

function AddHabit({
  count,
  blocked,
  quiet,
  onAddingChange,
  onAdded,
  onProblem,
}: {
  count: number;
  /** Why adding has to wait (an order being arranged or saved), or null. */
  blocked: string | null;
  /** Something else is the main action right now (an editor is open): Add steps back. */
  quiet: boolean;
  onAddingChange: (adding: boolean) => void;
  onAdded: (name: string, total: number) => void;
  onProblem: (result: HabitResult) => void;
}) {
  // Kept when you leave and come back: a half-typed habit isn't lost.
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const length = nameLength(normalizeHabitName(name));

  useEffect(() => onAddingChange(adding), [adding, onAddingChange]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (adding) return;
    // While an order is being arranged or saved, an add would make that
    // order out of date (the database refuses it), so it waits.
    if (blocked) {
      setError(blocked);
      return;
    }
    startAdding(async () => {
      let result: HabitResult;
      try {
        result = await createHabit(name);
      } catch {
        result = { ok: false, reason: "error", message: "Couldn't add it. Check your connection and try again." };
      }
      startTransition(() => {
        if (result.ok) {
          // Emptied only once it's saved, so a failure keeps what you typed.
          setName("");
          onAdded(result.name ?? name, count + 1);
        } else if (result.reason === "invalid" || result.reason === "limit") {
          setError(result.message);
        } else {
          onProblem(result); // also reloads the list: it may have saved after all
        }
      });
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-2">
      <TextField
        ref={inputRef}
        id="new-habit"
        label="New habit"
        placeholder="Call a friend"
        value={name}
        readOnly={Boolean(blocked)}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      {length > 50 && (
        <p className={`flex items-center gap-1.5 self-end text-sm tabular-nums ${length > HABIT_NAME_MAX ? "text-danger" : "text-ink-muted"}`}>
          {length > HABIT_NAME_MAX && <AlertIcon size={16} />}
          {length}/{HABIT_NAME_MAX}
        </p>
      )}
      {/* Persimmon only when adding is THE thing to do: secondary while
          arranging (when it's unavailable) or editing (Save is the action). */}
      <Button
        type="submit"
        variant={blocked || quiet ? "secondary" : "primary"}
        busy={adding}
        aria-disabled={adding || Boolean(blocked) || undefined}
        className={`mt-1 ${blocked ? "opacity-60" : ""}`}
      >
        <PlusIcon size={20} />
        {adding ? "Adding…" : "Add habit"}
      </Button>
      {blocked && <p className="text-sm text-ink-muted">{blocked}</p>}
    </form>
  );
}
