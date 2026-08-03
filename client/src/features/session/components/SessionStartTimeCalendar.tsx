import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface SessionStartTimeCalendarProps {
  /** Date-only significance — time-of-day comes from the separate hour/minute wheels. */
  value: Date | null;
  onSelect: (date: Date) => void;
  /** Days before this one render disabled — defaults to today (no scheduling into the past). */
  minDate?: Date;
  now?: Date;
}

/**
 * Hand-built month-grid calendar for `SessionStartTimePicker`'s "Pick a date" option — the date
 * wheel's 7 quick options (Today..+6 days) only cover a week, so this is the fallback for
 * sessions scheduled further out. No calendar/date-picker library exists in this codebase
 * (confirmed while scoping CLIENT-SESSION-2), so this is a from-scratch grid rather than a
 * wrapped third-party component — kept intentionally small (month nav + day cells only, no
 * range/multi-select) since that's all this field needs.
 */
export function SessionStartTimeCalendar({
  value,
  onSelect,
  minDate,
  now = new Date(),
}: SessionStartTimeCalendarProps) {
  const floor = startOfDay(minDate ?? now);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value ?? floor));

  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const canGoPrev = !isSameMonth(floor, viewMonth);

  return (
    <div className="w-64">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canGoPrev}
          onClick={() => setViewMonth((month) => subMonths(month, 1))}
          className="cursor-pointer rounded p-1 text-text-secondary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-40"
        >
          <IconChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="text-2sm font-medium text-text-primary">{format(viewMonth, 'MMMM yyyy')}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewMonth((month) => addMonths(month, 1))}
          className="cursor-pointer rounded p-1 text-text-secondary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {days.slice(0, 7).map((day) => (
          <span key={day.toISOString()} className="text-2xs text-text-muted" aria-hidden="true">
            {format(day, 'EEEEE')}
          </span>
        ))}
        {days.map((day) => {
          const disabled = isBefore(day, floor);
          const selected = value !== null && isSameDay(day, value);
          const outsideMonth = !isSameMonth(day, viewMonth);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              onClick={() => onSelect(day)}
              className={cn(
                'flex size-8 cursor-pointer items-center justify-center rounded-full text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:text-text-muted disabled:opacity-40',
                selected
                  ? 'bg-accent-solid font-medium text-white'
                  : outsideMonth
                    ? 'text-text-muted hover:bg-surface-1'
                    : 'text-text-primary hover:bg-surface-1',
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
