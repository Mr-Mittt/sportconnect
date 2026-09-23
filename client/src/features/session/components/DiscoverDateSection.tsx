import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { DiscoverDateSection as DiscoverDateSectionData } from '../types';
import { DiscoverResultsList } from './DiscoverResultsList';

interface DiscoverDateSectionProps {
  section: DiscoverDateSectionData;
  onToggleExpanded: (date: string) => void;
  onLoadMore: (date: string) => void;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
  gridClassName: string;
}

/**
 * CLIENT-SESSION-22 — one collapsible per-date section of the full `/matches` page's Discover
 * results, replacing the old flat grid. Same collapsible-header shell as `SessionDateGroup`
 * (chevron + `{label} (count)` + rule line); the results themselves are `DiscoverResultsList`
 * (shared with `SessionDiscoverModal`'s own flat, today-only list since the CLIENT-SESSION-22
 * delta, 2026-09-22). This section's `sessions`/loading/error/pagination all come from its own
 * lazy `/discover` query (`useDiscoverDateSections`) — nothing is fetched here.
 */
export function DiscoverDateSection({
  section,
  onToggleExpanded,
  onLoadMore,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  gridClassName,
}: DiscoverDateSectionProps) {
  const { date, label, count, isExpanded, sessions, isLoading, isError, hasMore, isFetchingMore } = section;

  return (
    <div>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} (${count})`}
        onClick={() => onToggleExpanded(date)}
        className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {isExpanded ? (
          <IconChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        ) : (
          <IconChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <span className="shrink-0 whitespace-nowrap text-2xs font-medium text-text-muted">
          {label} ({count})
        </span>
        <div className="h-px flex-1 bg-border" />
      </button>

      {isExpanded && (
        <div className="mt-3">
          <DiscoverResultsList
            sessions={sessions}
            isLoading={isLoading}
            isError={isError}
            hasMore={hasMore}
            isFetchingMore={isFetchingMore}
            onLoadMore={() => onLoadMore(date)}
            emptyMessage={`No sessions to discover on ${label}.`}
            errorMessage={`Couldn't load sessions for ${label}.`}
            sportsByKey={sportsByKey}
            currentUserId={currentUserId}
            onViewDetails={onViewDetails}
            onParticipationAction={onParticipationAction}
            isParticipationActionPending={isParticipationActionPending}
            gridClassName={gridClassName}
          />
        </div>
      )}
    </div>
  );
}
