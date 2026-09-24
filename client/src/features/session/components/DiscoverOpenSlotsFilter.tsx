import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

interface DiscoverOpenSlotsFilterProps {
  /** Raw input text, not the parsed number — `useDiscoverBaseFilters` owns the real clamp so
   * every Discover surface parses identically; this component sanitizes keystrokes (digits only)
   * and re-clamps the displayed text on blur, but the derived `minOpenSlots` sent to the server
   * always goes through that hook's own clamp regardless. */
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

const MIN_OPEN_SLOTS = 1;
const MAX_OPEN_SLOTS = 999;

function clamp(n: number): number {
  return Math.min(MAX_OPEN_SLOTS, Math.max(MIN_OPEN_SLOTS, n));
}

/**
 * CLIENT-SESSION-29's open-slot-count filter (`minOpenSlots`) — a single validated number input.
 * Empty = no filter.
 *
 * **2026-09-23 revision:** a direct inline input instead of a Popover-hidden one — the filter has
 * exactly one field, so hiding it behind a trigger button added a click for no benefit the other
 * (genuinely multi-control) filters get from their Popover.
 *
 * **Second revision, same day:** range clamped to `1..999` inclusive (was `1..998`, corrected per
 * direct clarification). "Only number input, no (-) input" — `onChange` strips every non-digit
 * character (not just `-`; also blocks `.`/`e`/`+`, which a native `type="number"` input otherwise
 * accepts) so the displayed text can never be anything but plain digits, and `onBlur` re-clamps
 * whatever's left into range — same "auto reset to the limitation" a caller gets from
 * `DiscoverTimeFilter`'s Hour/Minute inputs already. Active-state background/reset "x" applied
 * directly here (not via `DiscoverFilterTrigger`, since this filter has no `Popover`/trigger to
 * wrap) — matches every other Discover filter now carrying that treatment.
 *
 * **Third revision, same day:** hand-drawn increment/decrement buttons replace the native number
 * spinner. The native one renders as its own opaque shadow-DOM box that ignores `background-color`
 * in current Chromium (confirmed empirically — a `::-webkit-inner-spin-button` rule matched and
 * applied per devtools, with zero visual effect), so there's no reliable way to make it match the
 * pill's `bg-filter-active` when active. Hand-drawn buttons are just normal DOM nodes with no
 * background of their own, so the pill's own background already shows through them correctly —
 * no CSS workaround needed. The native spinner is hidden entirely (`index.css`'s
 * `.discover-open-slots-input` rules) rather than left showing alongside a second, redundant pair.
 */
export function DiscoverOpenSlotsFilter({ value, onChange, onClear }: DiscoverOpenSlotsFilterProps) {
  const isSet = value.trim() !== '';

  const handleChange = (raw: string) => {
    onChange(raw.replace(/\D/g, ''));
  };

  const handleBlur = () => {
    if (value.trim() === '') return;
    onChange(String(clamp(Number.parseInt(value, 10) || MIN_OPEN_SLOTS)));
  };

  const step = (delta: number) => {
    if (value.trim() === '') {
      onChange(String(MIN_OPEN_SLOTS));
      return;
    }
    onChange(String(clamp((Number.parseInt(value, 10) || MIN_OPEN_SLOTS) + delta)));
  };

  return (
    <div
      className={cn(
        'border-hairline flex h-8 items-center gap-1 rounded-full border-border pr-1.5',
        isSet ? 'bg-filter-active pl-1' : 'bg-surface-2 pl-3',
      )}
    >
      {isSet && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear open slots filter"
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-danger"
        >
          <IconX className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_OPEN_SLOTS}
        max={MAX_OPEN_SLOTS}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === '.') {
            event.preventDefault();
          }
        }}
        onBlur={handleBlur}
        placeholder="Open slots"
        aria-label="Minimum open slots"
        className={cn(
          'discover-open-slots-input h-full w-20 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0',
        )}
      />
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Increase open slots"
          className="flex h-3.5 w-4 cursor-pointer items-center justify-center text-text-secondary hover:text-text-primary"
        >
          <IconChevronUp className="size-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Decrease open slots"
          className="flex h-3.5 w-4 cursor-pointer items-center justify-center text-text-secondary hover:text-text-primary"
        >
          <IconChevronDown className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
