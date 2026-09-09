import { cn } from '@/shared/lib/utils';

export interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  /** Shared `name` for the native radio inputs. */
  name: string;
  'aria-label'?: string;
  'aria-required'?: boolean;
  /** SPORT-13: clicking the already-selected segment clears the control (`onValueChange('')`). */
  allowDeselect?: boolean;
  className?: string;
}

/**
 * SPORT-13: a row of mutually-exclusive options rendered as connected buttons — the `segmented`
 * layout for `BOOLEAN` (Yes/No) and short `ENUM`s.
 *
 * Built on native radios (visually replaced by the styled segments) so keyboard roving and
 * screen-reader semantics come for free — no `@radix-ui/react-toggle-group` dependency. The
 * caller is responsible for only using this when the option count is small (the `EnumField`
 * degrades to `dropdown` past a threshold).
 */
export function SegmentedControl({
  value,
  onValueChange,
  options,
  name,
  className,
  allowDeselect = false,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
}: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-required={ariaRequired}
      className={cn(
        'inline-flex overflow-hidden rounded-lg border-hairline border-border-strong',
        className,
      )}
    >
      {options.map((option, index) => {
        const id = `${name}-${option.value}`;
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              'cursor-pointer px-3 py-1.5 text-sm transition-colors',
              index > 0 && 'border-hairline-l border-border-strong',
              selected
                ? 'bg-accent-solid text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              'focus-within:ring-2 focus-within:ring-border-accent focus-within:ring-offset-1 focus-within:ring-offset-surface-0',
            )}
          >
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={selected}
              onChange={(event) => onValueChange(event.target.value)}
              onClick={
                allowDeselect
                  ? () => {
                      if (selected) onValueChange('');
                    }
                  : undefined
              }
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
