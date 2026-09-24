import { IconChevronDown, IconX } from '@tabler/icons-react';
import { PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';

interface DiscoverFilterTriggerProps {
  label: string;
  isActive: boolean;
  onClear: () => void;
  clearLabel: string;
}

/**
 * CLIENT-SESSION-29 (2026-09-23, second revision) — the shared pill shell every Popover-based
 * Discover filter (Date/Time/Location/Status/Fee) renders as its `PopoverTrigger`: once the
 * filter carries a non-default value, the pill's background switches to `bg-filter-active` and a
 * red "x" appears to the left of the label, resetting it to default in one click without opening
 * the popover. The "x" and the label+chevron are deliberately SIBLING `<button>`s inside one
 * bordered container, not one button nested inside another — nesting interactive controls is
 * invalid HTML, and the two need independent click targets (resetting must never also toggle the
 * popover open). `DiscoverOpenSlotsFilter` (the one filter with no Popover/trigger at all)
 * re-implements this same background/x treatment inline instead of reusing this component.
 */
export function DiscoverFilterTrigger({
  label,
  isActive,
  onClear,
  clearLabel,
}: DiscoverFilterTriggerProps) {
  return (
    <div
      className={cn(
        'border-hairline inline-flex h-8 items-center rounded-lg border-border-strong',
        isActive ? 'bg-filter-active' : 'bg-transparent hover:bg-surface-1',
      )}
    >
      {isActive && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="flex h-full shrink-0 cursor-pointer items-center pl-2 pr-1 text-text-danger"
        >
          <IconX className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-full cursor-pointer items-center gap-1 rounded-lg text-2sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
            isActive ? 'py-1.5 pr-2 pl-1' : 'px-2',
          )}
        >
          {label}
          <IconChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
    </div>
  );
}
