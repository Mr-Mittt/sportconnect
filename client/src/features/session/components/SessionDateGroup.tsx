import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { SessionListCard } from './SessionListCard';
import type { SessionDateGroup as SessionDateGroupData } from '../groupSessionsByDate';
import type { SportKey, SportProfile } from '@/shared/types/sport';

interface SessionDateGroupProps extends SessionDateGroupData {
  sportsByKey: Record<SportKey, SportProfile>;
  isCollapsed: boolean;
  onToggleCollapsed: (dateKey: string) => void;
  onViewDetails: (sessionId: number) => void;
}

/**
 * One collapsible calendar-day section of the Matches page's "My sessions" panel — a toggle
 * header (chevron + date label + rule line) plus its sessions, reusing the same
 * `SessionListCard` the Discover grid uses. `dateKey` (not `dateLabel`, which repeats as
 * "Today" across sessions/reloads) is the collapse-state identity.
 */
export function SessionDateGroup({
  dateKey,
  dateLabel,
  sessions,
  sportsByKey,
  isCollapsed,
  onToggleCollapsed,
  onViewDetails,
}: SessionDateGroupProps) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${dateLabel}`}
        onClick={() => onToggleCollapsed(dateKey)}
        className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {isCollapsed ? (
          <IconChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        ) : (
          <IconChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <span className="shrink-0 whitespace-nowrap text-2xs font-medium text-text-muted">{dateLabel}</span>
        <div className="h-px flex-1 bg-border" />
      </button>

      {!isCollapsed && (
        <div className="mt-3 flex flex-col gap-3">
          {sessions.map((session) => (
            <SessionListCard
              key={session.id}
              session={session}
              sportsByKey={sportsByKey}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}
