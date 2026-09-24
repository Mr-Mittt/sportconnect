import { useState } from 'react';
import { format } from 'date-fns';
import { Popover, PopoverContent } from '@/shared/ui/popover';
import { MAX_DISCOVER_DATES } from '../discoverDateLabel';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';
import { SessionStartTimeCalendar } from './SessionStartTimeCalendar';

interface DiscoverDatePickerProps {
  quickDates: string[];
  selectedDates: string[];
  onToggleDate: (date: string) => void;
  /** Checklist-row label — "Tomorrow" also carries its date here (unlike the bare `dateLabel` a
   * section header uses), since a checkbox list has no other context making the date obvious. */
  dateOptionLabel: (date: string) => string;
  /** Bare label ("Today"/"Tomorrow"/"Thu, 15th Oct", no parenthetical date) — same fn
   * `useDiscoverFilters` gives each date section's own header. Used for the trigger button when
   * exactly one date is selected (2026-09-23 revision, see doc comment below). */
  dateLabel: (date: string) => string;
  isAtMax: boolean;
  /** Date's own default isn't "unselected" (never allow zero selection — see
   * `useDiscoverFilters.toggleDate`), it's `[today]`, so "is this filter active" and "reset to
   * default" can't be derived from `selectedDates` alone the way every other Discover filter's
   * can; both come from the hook, which already tracks `today` (2026-09-23 revision). */
  isActive: boolean;
  onReset: () => void;
}

/**
 * CLIENT-SESSION-22's Date filter — a checklist multi-select version of `SessionStartTimePicker`'s
 * single-select Today/Tomorrow/next-5-days dropdown, plus the same "Pick a date…" inline calendar
 * for anything further out (`SessionStartTimeCalendar`, reused as-is). Capped at
 * `MAX_DISCOVER_DATES` (matches `/discover/counts`' own hard cap) — further checkboxes disable
 * once reached rather than silently doing nothing. A real Radix `Popover` (not a hand-rolled inline
 * reveal): `Popover` defaults `modal={false}`, so nesting it inside `SessionDiscoverModal`'s own
 * Dialog is safe — verified via `CreateSessionModal`'s `LocationFavoritesDropdown` precedent (a
 * `DropdownMenu`, which needed `modal={false}` explicitly since it defaults `true`; `Popover`
 * never had that problem at all).
 *
 * **Trigger label (2026-09-23 revision):** 0 selected → "Date"; exactly 1 → that date's own bare
 * label ("Today"/"Thu, 15th Oct" — previously stayed the generic "Date" even with one picked,
 * giving no indication which date was active without opening the popover); 2+ → "Date (N)".
 */
export function DiscoverDatePicker({
  quickDates,
  selectedDates,
  onToggleDate,
  dateOptionLabel,
  dateLabel,
  isAtMax,
  isActive,
  onReset,
}: DiscoverDatePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const selectedSet = new Set(selectedDates);
  const customDates = selectedDates.filter((date) => !quickDates.includes(date));
  const triggerLabel =
    selectedDates.length === 0
      ? 'Date'
      : selectedDates.length === 1
        ? dateLabel(selectedDates[0])
        : `Date (${selectedDates.length})`;

  return (
    <Popover onOpenChange={(open) => !open && setShowCalendar(false)}>
      <DiscoverFilterTrigger
        label={triggerLabel}
        isActive={isActive}
        onClear={onReset}
        clearLabel="Reset date filter"
      />
      <PopoverContent align="start" className="w-64">
        {showCalendar ? (
          <div className="flex flex-col gap-2">
            <SessionStartTimeCalendar
              value={null}
              minDate={new Date()}
              onSelect={(date) => {
                onToggleDate(format(date, 'yyyy-MM-dd'));
                setShowCalendar(false);
              }}
            />
            <button
              type="button"
              onClick={() => setShowCalendar(false)}
              className="cursor-pointer rounded text-2xs text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              Choose from the list instead
            </button>
          </div>
        ) : (
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Dates to discover</legend>
            {[...quickDates, ...customDates].map((date) => {
              const checked = selectedSet.has(date);
              const disabled = !checked && isAtMax;
              return (
                <label
                  key={date}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2sm text-text-primary hover:bg-surface-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggleDate(date)}
                    className="size-4 accent-accent-solid"
                  />
                  {dateOptionLabel(date)}
                </label>
              );
            })}
            <button
              type="button"
              disabled={isAtMax}
              onClick={() => setShowCalendar(true)}
              className="mt-1 cursor-pointer rounded px-2 py-1.5 text-left text-2sm text-text-accent hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pick a date…
            </button>
            {isAtMax && (
              <p className="px-2 text-2xs text-text-muted">
                Up to {MAX_DISCOVER_DATES} dates at once.
              </p>
            )}
          </fieldset>
        )}
      </PopoverContent>
    </Popover>
  );
}
