// A habit's days as dots, oldest left, today right. Today's keys use the
// 10 px size for the last 7 days; History uses it at 7 days and 7 px
// ("sm") for 30 and 90, so a row of 30 still fits a phone. Always
// aria-hidden: the same days are described in words next to them.

import type { Dot } from "@/lib/streaks";

type Size = "md" | "sm";

/** [on a surface, on a persimmon key] for each state and size. */
const DOT_STYLE: Record<Size, Record<Dot["state"], [onSurface: string, onAccent: string]>> = {
  md: {
    done: ["size-2.5 bg-accent", "size-2.5 bg-on-accent"],
    missed: ["size-2.5 border-[1.5px] border-ink-muted", "size-2.5 border-[1.5px] border-on-accent"],
    open: ["size-2.5 border-2 border-accent", "size-2.5 border-2 border-on-accent"],
    before: ["size-1 bg-ink-muted/35", "size-1 bg-on-accent/40"],
  },
  sm: {
    done: ["size-[7px] bg-accent", "size-[7px] bg-on-accent"],
    missed: ["size-[7px] border-[1.5px] border-ink-muted", "size-[7px] border-[1.5px] border-on-accent"],
    open: ["size-[7px] border-2 border-accent", "size-[7px] border-2 border-on-accent"],
    before: ["size-[3px] bg-ink-muted/35", "size-[3px] bg-on-accent/40"],
  },
};

const CELL: Record<Size, string> = { md: "size-2.5", sm: "size-[7px]" };

export function Dots({
  dots,
  onAccent = false,
  size = "md",
  className = "flex items-center gap-1.5",
}: {
  dots: Dot[];
  onAccent?: boolean;
  size?: Size;
  /** The row's layout: Today's tight row by default. */
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={className}>
      {dots.map((dot) => (
        <span key={dot.day} className={`flex shrink-0 items-center justify-center ${CELL[size]}`}>
          <span className={`rounded-full ${DOT_STYLE[size][dot.state][onAccent ? 1 : 0]}`} />
        </span>
      ))}
    </span>
  );
}
