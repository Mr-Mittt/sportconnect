import { cn } from '@/shared/lib/utils';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  id?: string;
  'aria-label'?: string;
  /** Text shown next to the track and used as `aria-valuetext` (e.g. a formatted value). */
  valueText?: string;
  className?: string;
}

/**
 * SPORT-13: native `<input type="range">` with a visible value readout — the `slider` layout for a
 * `NUMBER` attribute that declares `min`/`max`.
 *
 * Native (not `@radix-ui/react-slider`) — the range input is fully keyboard-operable and
 * screen-reader-announced on its own. `NumberField` only picks this layout when both bounds are
 * present; without them it falls back to the plain number input.
 */
export function Slider({
  value,
  onValueChange,
  min,
  max,
  step,
  id,
  className,
  valueText,
  'aria-label': ariaLabel,
}: SliderProps) {
  const display = valueText ?? String(value);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step ?? 'any'}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={display}
        onChange={(event) => onValueChange(event.target.valueAsNumber)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-strong accent-accent-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      />
      <output htmlFor={id} className="w-16 shrink-0 text-right text-sm tabular-nums text-text-primary">
        {display}
      </output>
    </div>
  );
}
