import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { IconCheck } from '@tabler/icons-react';
import { cn } from '@/shared/lib/utils';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** A disabled box keeps showing its state (a ticked one stays ticked) at reduced opacity. */
  disabled?: boolean;
  /** `aria-label` for the control: required, the box has no text of its own (the row beside it does, but is not its label). */
  'aria-label': string;
  id?: string;
  className?: string;
}

/**
 * CLIENT-SESSION-49: the app's checkbox, a restyled Radix primitive (`@radix-ui/react-checkbox`, owner-approved) so the keyboard
 * (Space toggles) and the screen-reader state come from Radix. Controlled and two-state only (no indeterminate).
 * Tokens only: ticked = `accent-solid` with a `surface-2` check, empty = a `border-strong` outline; the focus ring is the same as
 * every other control.
 */
export function Checkbox({ checked, onCheckedChange, disabled = false, id, className, 'aria-label': ariaLabel }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border-hairline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-accent-solid bg-accent-solid' : 'border-border-strong bg-surface-2',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <IconCheck className="size-3 text-surface-2" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
