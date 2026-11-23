// Hold's buttons: pills you press like a key. Primary and secondary sit on
// a lip along the bottom edge (outside the button). Pressed, the face moves
// down 2 px and the lip shrinks from 3 px to 1 px, so the bottom stays put
// and the key sinks. With Reduce Motion the face doesn't move; the lip still
// shrinks, because that's state, not movement. At least 48 px tall.

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full px-6 text-base font-semibold " +
  "transition-[transform,box-shadow,background-color,color] duration-(--motion-fast) ease-(--ease-out) " +
  "aria-disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "mb-[3px] bg-accent text-on-accent shadow-[0_3px_0_var(--accent-lip)] " +
    "active:shadow-[0_1px_0_var(--accent-lip)] motion-safe:active:translate-y-[2px]",
  secondary:
    "mb-[3px] border border-line bg-surface text-ink shadow-[0_3px_0_var(--surface-sunk)] " +
    "active:shadow-[0_1px_0_var(--surface-sunk)] motion-safe:active:translate-y-[2px]",
  // No lip: a quiet text button. Pressed, it gets a sunk background, so
  // there's feedback on touch even without motion.
  ghost: "text-ink-muted hover:text-ink active:bg-surface-sunk active:text-ink",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /**
   * Working on it: the button can't be pressed again, but keeps its focus
   * and full colour (aria-disabled, not disabled: disabled would push
   * keyboard focus away and grey it out).
   */
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, className = "", type = "button", onClick, ...props }: Props) {
  return (
    <button
      type={type}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}
