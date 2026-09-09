import { cn } from '@/shared/lib/utils';

export interface RadioOption {
  value: string;
  label: string;
}

interface RadioGroupProps {
  /** The selected `value`, or `''` for none. */
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  /** Shared `name` for the native radio inputs — required so the group behaves as one. */
  name: string;
  /** `aria-labelledby`/`aria-label` target: the group needs a name for screen readers. */
  'aria-label'?: string;
  'aria-required'?: boolean;
  /** SPORT-13: clicking the already-selected option clears the group (fires `onValueChange('')`).
   * Native radios can't be unchecked by the user, so this is opt-in. */
  allowDeselect?: boolean;
  className?: string;
}

/**
 * SPORT-13: a vertical list of native `<input type="radio">` options, token-styled.
 *
 * Hand-written over native inputs (not `@radix-ui/react-radio-group`, which isn't in this repo) —
 * same reasoning as `Select`/`Switch`: native radios give full keyboard (arrow-key roving) and
 * screen-reader support for free. The `radio` layout for an `ENUM` attribute renders through this.
 */
export function RadioGroup({
  value,
  onValueChange,
  options,
  name,
  className,
  allowDeselect = false,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-required={ariaRequired}
      className={cn('flex flex-col gap-1.5', className)}
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
          >
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(event) => onValueChange(event.target.value)}
              onClick={
                allowDeselect
                  ? () => {
                      // A click on the already-checked radio fires no `change` event — clear here.
                      if (value === option.value) onValueChange('');
                    }
                  : undefined
              }
              className="size-4 accent-accent-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
