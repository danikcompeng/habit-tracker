// A labelled text box with its error underneath. The error is tied to the
// box (aria-describedby) and announced when it appears.
// 16 px text, so iPhones don't zoom in when you tap it.

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { ErrorText } from "./error-text";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  /** Extra text above the box, read out with it. */
  hint?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function TextField({ id, label, error, hint, className = "", ref, ...props }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      {hint && (
        <p id={hintId} className="mb-1 break-words text-base text-ink">
          {hint}
        </p>
      )}
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={
          "h-12 w-full rounded-(--radius-field) border border-ink-muted bg-surface px-4 text-base text-ink " +
          "placeholder:text-ink-muted aria-invalid:border-danger " +
          className
        }
        {...props}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
