import { cn } from '@/shared/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** `aria-label` for the control — required, it has no visible text of its own. */
  'aria-label': string;
  id?: string;
  className?: string;
}

/**
 * Hand-written sliding toggle (not a Radix primitive — no `@radix-ui/react-switch` in this repo,
 * and the same "hand-written, keyboard/SR support for free from the native element" reasoning as
 * `Select`/`Input`). A `<button role="switch">` with `aria-checked`; Space/Enter toggle it.
 * Tokens only: on = `accent-solid`, off = `border-strong`, white thumb.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent-solid' : 'bg-border-strong',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block size-4 rounded-full bg-surface-2 shadow-sm transition-transform',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
