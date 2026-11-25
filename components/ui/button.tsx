// Ascend's buttons: pills you press like a key. Primary, secondary and
// danger sit on a lip along the bottom edge (outside the button). Pressed,
// the face moves down 2 px and the lip shrinks from 3 px to 1 px, so the
// bottom stays put and the key sinks. With Reduce Motion the face doesn't
// move; the lip still shrinks, because that's state, not movement.
//
// Size and width are options, never extra classes: without a class merger,
// a "w-auto" added after "w-full" can lose depending on stylesheet order
// (which is how the Edit pill once filled half of Today's header).

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonOptions = {
  /** "md": 48 px tall, 16 px text (default). "sm": 44 px, 14 px text, for compact header pills. */
  size?: "md" | "sm";
  /** Fill the width of its container (default) or fit its label. */
  block?: boolean;
};

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-full py-2 text-center font-semibold text-balance " +
  "transition-[transform,box-shadow,background-color,color,opacity] duration-(--motion-fast) ease-(--ease-out) " +
  "aria-disabled:cursor-not-allowed";

const SIZES = {
  md: "min-h-12 px-6 text-base",
  sm: "min-h-11 px-5 text-sm",
} as const;

const KEY = "mb-[3px] motion-safe:active:translate-y-[2px]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `${KEY} bg-accent text-on-accent shadow-[0_3px_0_var(--accent-lip)] active:shadow-[0_1px_0_var(--accent-lip)]`,
  secondary: `${KEY} border border-line bg-surface text-ink shadow-[0_3px_0_var(--surface-sunk)] active:shadow-[0_1px_0_var(--surface-sunk)]`,
  danger: `${KEY} bg-danger text-surface shadow-[0_3px_0_var(--danger-lip)] active:shadow-[0_1px_0_var(--danger-lip)]`,
  // No lip: a quiet text button. Pressed, it gets a sunk background, so
  // there's feedback on touch even without motion.
  ghost: "text-ink-muted hover:text-ink active:bg-surface-sunk active:text-ink",
};

export function buttonClass(variant: ButtonVariant = "primary", options: ButtonOptions = {}, extra = ""): string {
  const { size = "md", block = true } = options;
  // Labels wrap only when text is very large, instead of spilling out of
  // the pill (py-2 only shows then: one line is 24 px inside the 48 / 44 px
  // minimum). Rows of pills wrap first (flex-wrap), so a squeezed row
  // never breaks "To bottom" in two at normal size.
  const width = block ? "w-full" : "w-auto max-w-full";
  return [BASE, SIZES[size], width, VARIANTS[variant], extra].filter(Boolean).join(" ");
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonOptions & {
    variant?: ButtonVariant;
    /**
     * Working on it: the button can't be pressed again, but keeps its focus
     * and full colour (aria-disabled, not disabled: disabled would push
     * keyboard focus away and grey it out).
     */
    busy?: boolean;
  };

export function Button({
  variant = "primary",
  size,
  block,
  busy = false,
  className = "",
  type = "button",
  onClick,
  onKeyDown,
  ...props
}: Props) {
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
      onKeyDown={(event) => {
        // A held-down Enter repeats; for a destructive button that would
        // mean "yes" twice. One press, one action.
        if (variant === "danger" && event.repeat) event.preventDefault();
        onKeyDown?.(event);
      }}
      className={buttonClass(variant, { size, block }, className)}
      {...props}
    />
  );
}
