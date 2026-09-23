import { useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import type { StartTimeFilter } from '@/shared/types/session';

function clampHour(value: string): string {
  const n = Math.min(23, Math.max(0, Number.parseInt(value, 10) || 0));
  return String(n).padStart(2, '0');
}

function clampMinute(value: string): string {
  const n = Math.min(59, Math.max(0, Number.parseInt(value, 10) || 0));
  return String(n).padStart(2, '0');
}

function nowHourMinute(): [string, string] {
  const now = new Date();
  return [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')];
}

const DIRECTION_LABELS: Record<StartTimeFilter, string> = {
  BEFORE_OR_EQUAL: 'before',
  AFTER_OR_EQUAL: 'after',
};

interface DiscoverTimeFilterProps {
  startTimeFilter: StartTimeFilter | undefined;
  onStartTimeFilterChange: (filter: StartTimeFilter) => void;
  startTime: string | undefined;
  onStartTimeChange: (time: string) => void;
  onClear: () => void;
}

/**
 * CLIENT-SESSION-22's Time filter (redesigned 2026-09-22, delta). Horizontal row: **Before**
 * toggle — Hour — Minute — **After** toggle. Before/After are the filter's actual on/off switch
 * (mutually exclusive — clicking the already-active one turns the filter off entirely, same as
 * the old "Clear time filter" link did), not a direction picker alongside a separately-committed
 * time; Hour/Minute are plain validated 24h number inputs (0-23 / 0-59, clamped on change), always
 * visible and editable even before a direction is chosen — pre-filled with the current time
 * (`now()`) the first time this opens with no filter set, so a caller who taps a direction
 * immediately gets a sensible value rather than `00:00`.
 */
export function DiscoverTimeFilter({
  startTimeFilter,
  onStartTimeFilterChange,
  startTime,
  onStartTimeChange,
  onClear,
}: DiscoverTimeFilterProps) {
  const isSet = startTime !== undefined;
  const [startHour, startMinute] = startTime !== undefined ? startTime.split(':') : nowHourMinute();
  const [hour, setHour] = useState(startHour);
  const [minute, setMinute] = useState(startMinute);

  const commitHour = (raw: string) => {
    const next = clampHour(raw);
    setHour(next);
    if (isSet) onStartTimeChange(`${next}:${minute}`);
  };
  const commitMinute = (raw: string) => {
    const next = clampMinute(raw);
    setMinute(next);
    if (isSet) onStartTimeChange(`${hour}:${next}`);
  };

  const toggleDirection = (direction: StartTimeFilter) => {
    if (startTimeFilter === direction) {
      onClear();
      return;
    }
    onStartTimeFilterChange(direction);
    onStartTimeChange(`${hour}:${minute}`);
  };

  const directionButtonClass = (active: boolean) =>
    cn(
      'cursor-pointer rounded-lg border-hairline px-3 py-2 text-2sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
      active
        ? 'border-accent-solid bg-accent-solid text-white'
        : 'border-border-strong bg-transparent text-text-primary hover:bg-surface-1',
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          {isSet ? `Start ${DIRECTION_LABELS[startTimeFilter ?? 'AFTER_OR_EQUAL']} ${startTime}` : 'Time'}
          <IconChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={startTimeFilter === 'BEFORE_OR_EQUAL'}
            onClick={() => toggleDirection('BEFORE_OR_EQUAL')}
            className={directionButtonClass(startTimeFilter === 'BEFORE_OR_EQUAL')}
          >
            Before
          </button>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Hour"
            min={0}
            max={23}
            value={hour}
            onChange={(event) => setHour(event.target.value)}
            onBlur={(event) => commitHour(event.target.value)}
            className="h-auto w-14 rounded-lg border-hairline border-border-strong bg-surface-2 px-2 py-2 text-center text-sm text-text-primary outline-none focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent"
          />
          <span className="text-text-muted">:</span>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Minute"
            min={0}
            max={59}
            value={minute}
            onChange={(event) => setMinute(event.target.value)}
            onBlur={(event) => commitMinute(event.target.value)}
            className="h-auto w-14 rounded-lg border-hairline border-border-strong bg-surface-2 px-2 py-2 text-center text-sm text-text-primary outline-none focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent"
          />
          <button
            type="button"
            aria-pressed={startTimeFilter === 'AFTER_OR_EQUAL'}
            onClick={() => toggleDirection('AFTER_OR_EQUAL')}
            className={directionButtonClass(startTimeFilter === 'AFTER_OR_EQUAL')}
          >
            After
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
