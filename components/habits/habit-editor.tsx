"use client";

// The inline editor under a habit on /habits: rename, move to top or
// bottom, delete (with an inline "are you sure"). Rename and delete aren't
// optimistic: they show "Saving…" / "Deleting…" until the server answers,
// so a failure keeps what you typed and says why, right here. Moves change
// the order on screen at once (the list saves it).

import { startTransition, useEffect, useRef, useState, useTransition } from "react";
import { AlertIcon, ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { TextField } from "@/components/ui/text-field";
import { deleteHabit, renameHabit, type HabitResult } from "@/lib/habit-actions";
import { HABIT_NAME_MAX, nameLength, normalizeHabitName, validateHabitName } from "@/lib/habit-name";

type Props = {
  habit: { id: string; name: string };
  isFirst: boolean;
  isLast: boolean;
  /** Close the editor; `focusEdit`: put focus back on this habit's Edit button. */
  onClose: (focusEdit: boolean) => void;
  onMove: (where: "top" | "bottom") => void;
  onDeleted: () => void;
  onRenamed: (name: string) => void;
  /** The habit isn't there any more (deleted elsewhere, demo reset). */
  onGone: (message: string) => void;
  /** Couldn't reach the server: the list reloads to show what's really saved. */
  onUnreachable: () => void;
};

const UNREACHABLE: HabitResult = { ok: false, reason: "error", message: "Couldn't save. Check your connection and try again." };

async function safely(call: () => Promise<HabitResult>): Promise<HabitResult> {
  try {
    return await call();
  } catch {
    return UNREACHABLE;
  }
}

export function HabitEditor({ habit, isFirst, isLast, onClose, onMove, onDeleted, onRenamed, onGone, onUnreachable }: Props) {
  const [draft, setDraft] = useState(habit.name);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const deleteRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const wasConfirming = useRef(false);
  const busy = saving || deleting;

  // Asking: focus goes to the QUESTION (read out, and nothing destructive
  // is one keypress away). "Keep it" puts focus back on "Delete habit".
  useEffect(() => {
    if (confirming) questionRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const length = nameLength(normalizeHabitName(draft));
  const counterId = `rename-${habit.id}-count`;

  /** What to do with a failed rename or delete. */
  function handleFailure(result: Extract<HabitResult, { ok: false }>) {
    if (result.reason === "invalid") setError(result.message);
    else if (result.reason === "gone") onGone(result.message);
    else {
      setProblem(result.message);
      onUnreachable();
    }
  }

  function save() {
    const name = normalizeHabitName(draft);
    if (name === habit.name) return onClose(true); // nothing changed: no request
    const problemWithName = validateHabitName(name);
    if (problemWithName) return setError(problemWithName);
    setProblem(null);
    startSaving(async () => {
      const result = await safely(() => renameHabit(habit.id, name));
      // In the same transition as the refreshed list, so the old name never
      // flashes back for a frame.
      startTransition(() => {
        if (result.ok) {
          onRenamed(name);
          onClose(true);
        } else handleFailure(result);
      });
    });
  }

  function remove() {
    if (deleting) return;
    setProblem(null);
    startDeleting(async () => {
      const result = await safely(() => deleteHabit(habit.id));
      startTransition(() => {
        if (result.ok) onDeleted();
        else handleFailure(result);
      });
    });
  }

  return (
    <div
      className="flex flex-col gap-4 border-t border-line px-4 pt-4 pb-5"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onClose(true);
        }
      }}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) save();
        }}
        className="flex flex-col gap-3"
      >
        <TextField
          id={`rename-${habit.id}`}
          label="Name"
          value={draft}
          autoFocus
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
        />
        {length > 50 && (
          <p
            id={counterId}
            className={`-mt-1 flex items-center gap-1.5 self-end text-sm tabular-nums ${length > HABIT_NAME_MAX ? "text-danger" : "text-ink-muted"}`}
          >
            {length > HABIT_NAME_MAX && <AlertIcon size={16} />}
            {length}/{HABIT_NAME_MAX}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" busy={busy} className="flex-1">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="secondary" busy={busy} onClick={() => onClose(true)} className="flex-1 aria-disabled:opacity-60">
            Cancel
          </Button>
        </div>
        {problem && <ErrorText>{problem}</ErrorText>}
      </form>

      {/* Moving is secondary to renaming: a light, compact row. */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          block={false}
          busy={busy}
          aria-disabled={isFirst || busy || undefined}
          aria-label={isFirst ? "Already first" : "Move to top"}
          data-move={`${habit.id}-top`}
          onClick={() => !isFirst && onMove("top")}
          className="-ml-3 aria-disabled:opacity-60"
        >
          <ArrowUpIcon size={18} />
          {isFirst ? "First" : "To top"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          block={false}
          busy={busy}
          aria-disabled={isLast || busy || undefined}
          aria-label={isLast ? "Already last" : "Move to bottom"}
          data-move={`${habit.id}-bottom`}
          onClick={() => !isLast && onMove("bottom")}
          className="aria-disabled:opacity-60"
        >
          <ArrowDownIcon size={18} />
          {isLast ? "Last" : "To bottom"}
        </Button>
      </div>

      {/* The question replaces "Delete habit" in place, under a hairline:
          no card inside the card. */}
      <div className="border-t border-line pt-4">
        {confirming ? (
          <div className="flex flex-col gap-3" role="group" aria-labelledby={`confirm-${habit.id}`}>
            <p ref={questionRef} tabIndex={-1} id={`confirm-${habit.id}`} className="text-base font-medium text-ink outline-none">
              Delete {habit.name}? Its streak and history go too.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" busy={deleting} onClick={remove} className="flex-1">
                <TrashIcon size={18} />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="secondary" busy={deleting} onClick={() => setConfirming(false)} className="flex-1 aria-disabled:opacity-60">
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <button
            ref={deleteRef}
            type="button"
            aria-disabled={busy || undefined}
            onClick={() => !busy && setConfirming(true)}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-full pr-2 text-base font-semibold text-danger active:bg-surface-sunk aria-disabled:opacity-60"
          >
            <TrashIcon size={18} />
            Delete habit
          </button>
        )}
      </div>
    </div>
  );
}
