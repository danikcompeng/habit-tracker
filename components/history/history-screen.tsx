"use client";

// History (plans/habit-tracker.md, Feature 7): the range switch, three
// numbers, a bar per day, and a row of dots per habit. All the counting is
// in lib/history.ts; this file draws it and handles the day you point at.
//
// The server sends the last 90 days once; 7 and 30 are part of them, so
// switching range is instant and keeps focus on the switch. The URL
// follows (replaceState: no back-button entry per switch).

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { DayWatcher } from "@/components/day-watcher";
import { Dots } from "@/components/dots";
import { PlusIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui/button";
import {
  RANGES,
  buildHistory,
  chartGeometry,
  dayCount,
  dayReadout,
  dayValueText,
  habitSentence,
  scrubIndex,
  shortDate,
  summarySentence,
  weekdayInitial,
  type HabitSummary,
  type HistoryHabit,
  type HistoryView,
  type Range,
} from "@/lib/history";
import { dayLabel } from "@/lib/today";

type Props = { habits: HistoryHabit[]; today: string; initialRange: Range };

/** How far a finger moves before it counts as a drag, not a tap. */
const TOUCH_SLOP = 8;

export function HistoryScreen({ habits, today, initialRange }: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  // How many times the range was switched: the bars grow on a switch, never
  // on first load ("nothing moves on its own").
  const [switches, setSwitches] = useState(0);
  // The day being pointed at, by date (not index), so it survives a switch
  // or a refresh; null (or a day no longer shown) means today.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Fresh data from the server (a visit, a refresh, a new day) comes with
  // the range in the URL: follow it, so the page and its URL never
  // disagree, even when <Activity> kept this component alive.
  const [shownHabits, setShownHabits] = useState(habits);
  if (habits !== shownHabits) {
    setShownHabits(habits);
    setRange(initialRange);
  }
  const view = useMemo(() => buildHistory(habits, today, range), [habits, today, range]);

  // Hidden routes stay alive (<Activity>): coming back starts on today,
  // and the bars don't replay their grow (display: none restarts a CSS
  // animation).
  useLayoutEffect(
    () => () => {
      setSelectedDay(null);
      setSwitches(0);
    },
    [],
  );

  function choose(next: Range) {
    if (next === range) return;
    setRange(next);
    setSwitches((n) => n + 1);
    // A new range starts on today, the same every time.
    setSelectedDay(null);
    window.history.replaceState(null, "", `?range=${next}`);
  }

  return (
    <>
      <DayWatcher isHolding={() => false} />
      {view.empty ? (
        <EmptyState kind={view.empty} />
      ) : (
        <>
          <RangeSwitch range={range} onChange={choose} />
          <Numbers view={view} />
          <DayChart view={view} selectedDay={selectedDay} onSelect={setSelectedDay} animateKey={switches} />
          <HabitRows view={view} />
        </>
      )}
    </>
  );
}

function RangeSwitch({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  return (
    <div role="group" aria-label="Range" className="mt-6 grid grid-cols-3 gap-1 rounded-full bg-surface-sunk p-1">
      {RANGES.map((r) => {
        const selected = r === range;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(r)}
            className={
              "min-h-11 rounded-full border text-base tabular-nums transition-[background-color,color,transform] duration-(--motion-fast) ease-(--ease-out) " +
              // Selected: the surface face with an ink-muted edge, which is
              // what carries the state at 3:1 (surface on sunk is 1.2:1).
              // No lip: in dark the only available one was lighter than the
              // face, a highlight, not a lip.
              (selected
                ? "border-ink-muted bg-surface font-semibold text-ink"
                : "border-transparent font-medium text-ink-muted hover:text-ink active:bg-surface motion-safe:active:translate-y-px")
            }
          >
            {r} days
          </button>
        );
      })}
    </div>
  );
}

function Numbers({ view }: { view: HistoryView }) {
  const items = [
    {
      label: "Completed",
      value: view.percent === null ? "—" : `${view.percent}%`,
      unit: "",
    },
    {
      label: "Best streak now",
      value: String(view.bestNow),
      unit: view.bestNow === 1 ? "day" : "days",
    },
    {
      label: "Longest streak",
      value: String(view.longest),
      unit: view.longest === 1 ? "day" : "days",
    },
  ];
  return (
    // Two shared rows (subgrid): the numbers line up, and so do the labels
    // even when one wraps.
    <dl className="mt-6 grid grid-cols-3 grid-rows-[auto_auto] gap-x-3 gap-y-1">
      {items.map((item) => (
        // dt first for screen readers ("Completed, 75%"), number first on screen.
        <div key={item.label} className="row-span-2 grid grid-rows-subgrid">
          <dt className="row-start-2 text-sm font-medium text-pretty text-ink-muted">{item.label}</dt>
          <dd className="row-start-1 text-[1.75rem] leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums">
            {item.value}
            {item.unit && (
              <>
                {" "}
                <span className="text-base font-semibold text-ink-muted">{item.unit}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DayChart({
  view,
  selectedDay,
  onSelect,
  animateKey,
}: {
  view: HistoryView;
  selectedDay: string | null;
  onSelect: (day: string) => void;
  animateKey: number;
}) {
  const area = useRef<HTMLDivElement>(null);
  // Touch: where the finger went down, until it's clearly a sideways drag
  // (scrub) or a tap. A vertical swipe becomes a scroll (pointercancel) and
  // never moves the selection.
  const touchStart = useRef<{
    x: number;
    y: number;
    scrubbing: boolean;
  } | null>(null);
  const geometry = chartGeometry(view.days);
  const n = view.days.length;
  const found = selectedDay ? view.days.findIndex((d) => d.day === selectedDay) : -1;
  const index = found === -1 ? n - 1 : found;
  const total = view.days[index];

  function pick(event: ReactPointerEvent<HTMLDivElement>) {
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    onSelect(view.days[scrubIndex(event.clientX - box.left, box.width, n)].day);
  }

  return (
    <section aria-labelledby="chart-title" className="mt-8 rounded-(--radius-field) border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="chart-title" className="text-base font-semibold">
          Day by day
        </h2>
        <Legend />
      </div>

      {/* What the pointer (or the slider) is on. Not a live region: the
          slider's own value is what screen readers hear. */}
      <p aria-hidden="true" className="mt-4 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{dayReadout(total.day, view.today)}</span>
        <span className="font-medium text-ink-muted tabular-nums">{dayCount(total)}</span>
      </p>

      <div
        ref={area}
        className={
          "relative mt-2 h-36 touch-pan-y select-none " +
          // The slider sits invisibly over the chart; its focus ring shows here.
          "rounded-sm has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-accent"
        }
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            touchStart.current = {
              x: e.clientX,
              y: e.clientY,
              scrubbing: false,
            };
            return;
          }
          if (e.pointerType !== "mouse") e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        // Mouse: hovering is enough. Pen: while pressed. Touch: once the
        // finger moves more sideways than down (TOUCH_SLOP px).
        onPointerMove={(e) => {
          const start = touchStart.current;
          if (e.pointerType === "touch") {
            if (!start) return;
            const dx = Math.abs(e.clientX - start.x);
            if (!start.scrubbing && dx > TOUCH_SLOP && dx > Math.abs(e.clientY - start.y)) {
              start.scrubbing = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            if (start.scrubbing) pick(e);
            return;
          }
          if (e.pointerType === "mouse" || e.buttons !== 0) pick(e);
        }}
        onPointerUp={(e) => {
          // A tap (no scroll took it over) selects the bar under it.
          if (e.pointerType === "touch" && touchStart.current && !touchStart.current.scrubbing) pick(e);
          touchStart.current = null;
        }}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {/* The day being pointed at: a band behind its bar (lighter than
              the card in dark, so it reads as a highlight, not a hole), and
              a 1 px ink-muted rule through its middle that shows at 3:1
              even when a bar is 3 px wide. */}
          <rect x={index} y={0} width={1} height={geometry.height} className="fill-surface-sunk dark:fill-line" />
          <line
            x1={index + 0.5}
            x2={index + 0.5}
            y1={0}
            // From the top down to the bar, never through it.
            y2={geometry.bars[index].y}
            className="stroke-ink-muted"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <g
            key={animateKey}
            style={{ transformBox: "view-box", transformOrigin: "bottom" }}
            className={animateKey > 0 ? "motion-safe:animate-[bar-grow_var(--motion-pop)_var(--ease-out)_both]" : ""}
          >
            {geometry.bars.map((bar, i) =>
              bar.height > 0 ? (
                <rect
                  key={view.days[i].day}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  // accent-key: the done-key colour, calmer in dark, so a
                  // wall of bars doesn't glare at night.
                  className={geometry.separators ? "fill-accent-key stroke-surface" : "fill-accent-key"}
                  // At 90 days the bars touch, and a 1 px surface edge
                  // separates them exactly (a fractional gap would blur).
                  strokeWidth={geometry.separators ? 1 : undefined}
                  vectorEffect={geometry.separators ? "non-scaling-stroke" : undefined}
                />
              ) : null,
            )}
          </g>
          <line
            x1={0}
            x2={geometry.width}
            y1={geometry.height}
            y2={geometry.height}
            className="stroke-line"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path d={geometry.line} className="fill-none stroke-ink-muted" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <input
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={index}
          onChange={(e) => onSelect(view.days[Number(e.target.value)].day)}
          aria-label="Choose a day"
          aria-valuetext={dayValueText(total, view.today)}
          // Over the chart, so VoiceOver finds it by touch; no pointer
          // events, so a finger scrubs the chart underneath.
          className="pointer-events-none absolute inset-0 size-full opacity-0"
        />
      </div>

      {/* The day being pointed at, marked under its bar. */}
      <div aria-hidden="true" className="relative mt-1 h-[3px]">
        <span
          className="absolute inset-y-0 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${((index + 0.5) / n) * 100}%`, width: `max(8px, ${100 / n}%)` }}
        />
      </div>

      <DayLabels view={view} />

      <p className="mt-4 text-sm font-medium text-pretty text-ink-muted">{summarySentence(view)}</p>

      {/* Hidden in a div: a table ignores height: 1px, so sr-only on the table
          itself would leave its rows stretching the page (blank scroll). */}
      <div className="sr-only">
        <table>
          <caption>Habits done each day, last {view.range} days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Done</th>
              <th scope="col">Habits</th>
            </tr>
          </thead>
          <tbody>
            {view.days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day === view.today ? `Today, ${dayLabel(d.day)}` : dayLabel(d.day)}</th>
                <td>{d.done}</td>
                <td>{d.scheduled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <span aria-hidden="true" className="flex items-center gap-3 text-sm font-medium text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] bg-accent-key" />
        Done
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-ink-muted" />
        Habits
      </span>
    </span>
  );
}

function DayLabels({ view }: { view: HistoryView }) {
  if (view.range === 7) {
    return (
      <div aria-hidden="true" className="mt-2 grid grid-cols-7 text-center text-sm font-medium text-ink-muted">
        {view.days.map((d) => (
          <span key={d.day} className={d.day === view.today ? "font-semibold text-ink" : ""}>
            {weekdayInitial(d.day)}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="mt-2 flex justify-between text-sm font-medium text-ink-muted">
      <span>{shortDate(view.from)}</span>
      <span className="font-semibold text-ink">Today</span>
    </div>
  );
}

function HabitRows({ view }: { view: HistoryView }) {
  return (
    <section aria-labelledby="habits-title" className="mt-8">
      <h2 id="habits-title" className="text-base font-semibold">
        Each habit
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {view.habits.map((habit) => (
          <HabitRow key={habit.id} habit={habit} range={view.range} />
        ))}
      </ul>
    </section>
  );
}

function HabitRow({ habit, range }: { habit: HabitSummary; range: Range }) {
  // 30 to a line: 90 days are three lines (oldest first, today bottom right).
  const lines = range === 90 ? [0, 30, 60].map((start) => habit.dots.slice(start, start + 30)) : [habit.dots];
  return (
    <li className="rounded-(--radius-field) border border-line bg-surface p-5">
      <p className="sr-only">{habitSentence(habit)}</p>
      <div aria-hidden="true" className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-list font-semibold text-pretty">{habit.name}</span>
        <span className="shrink-0 text-list font-semibold tabular-nums">
          {habit.percent === null ? "—" : `${habit.percent}%`}
        </span>
      </div>
      {habit.addedOn && (
        <p aria-hidden="true" className="text-sm font-medium text-ink-muted">
          Added {shortDate(habit.addedOn)}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-1.5">
        {lines.map((dots, i) => (
          <Dots
            key={i}
            dots={dots}
            size={range === 7 ? "md" : "sm"}
            // 7 days: one dot under each weekday of the chart's grid.
            className={range === 7 ? "grid grid-cols-7 justify-items-center" : "flex items-center justify-between"}
          />
        ))}
      </div>
    </li>
  );
}

function EmptyState({ kind }: { kind: "no-habits" | "no-history" }) {
  return (
    <div className="mt-7 flex flex-col items-start gap-5 rounded-key border border-dashed border-ink-muted p-5">
      {kind === "no-habits" ? (
        <>
          <p className="text-base text-ink">No habits yet. Add one, and its history builds up here day by day.</p>
          <Link href="/habits" className={buttonClass("primary", { block: false })}>
            <PlusIcon size={20} />
            Add a habit
          </Link>
        </>
      ) : (
        <>
          <p className="text-base text-ink">Your history starts today. Complete a habit on Today and it shows up here.</p>
          <Link href="/" className={buttonClass("primary", { block: false })}>
            Go to Today
          </Link>
        </>
      )}
    </div>
  );
}
