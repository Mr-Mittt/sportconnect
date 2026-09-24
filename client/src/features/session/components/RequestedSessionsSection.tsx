import { useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';
import { DiscoverResultsList } from './DiscoverResultsList';

interface RequestedSessionsSectionProps {
  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
  gridClassName: string;
}

/**
 * CLIENT-SESSION-29's "Requested sessions" — the caller's own pending join requests
 * (`GET /sessions/requested`, backend SESSION-42), on the `/matches` page's Discover panel only
 * (below the filter row, above the results list's first/today date group — resolved at this
 * ticket's own pickup, see its ticket file). Its own empty state renders inside
 * `DiscoverResultsList`, reused as-is since a plain grid is exactly what this needs too.
 *
 * **Collapsible (2026-09-23 revision):** same chevron + `{label} (count)` header shell as
 * `DiscoverDateSection`, local `useState` for the toggle — unlike that section's own expand state,
 * this one doesn't gate a lazy fetch (there's a single `useRequestedSessions` query, not one per
 * section), so it's purely a display toggle, not wired to any parent state. `count` is the number
 * of items loaded so far (`sessions.length`), not a separate server-side total — no
 * `/requested/counts` endpoint exists.
 *
 * **No empty-state copy (2026-09-23, second revision):** the header's own `(0)` already says
 * there's nothing here — a second "No requested sessions." line below it was redundant, so the
 * expanded body renders nothing at all once there's genuinely zero (not loading, not errored).
 */
export function RequestedSessionsSection({
  sessions,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  gridClassName,
}: RequestedSessionsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section aria-label="Requested sessions" className="mb-3.5">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Requested sessions (${sessions.length})`}
        onClick={() => setIsExpanded((current) => !current)}
        className="mb-2 flex w-full cursor-pointer items-center gap-2.5 border-none bg-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {isExpanded ? (
          <IconChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        ) : (
          <IconChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <span className="shrink-0 whitespace-nowrap text-2xs font-medium text-text-muted">
          Requested sessions ({sessions.length})
        </span>
        <div className="h-px flex-1 bg-border" />
      </button>

      {isExpanded && (isLoading || isError || sessions.length > 0) && (
        <DiscoverResultsList
          sessions={sessions}
          isLoading={isLoading}
          isError={isError}
          hasMore={hasMore}
          isFetchingMore={isFetchingMore}
          onLoadMore={onLoadMore}
          // Required prop, but unreachable under the gate above (isLoading/isError/sessions.length
          // === 0 is exactly what that gate excludes) — kept as documentation of what this text
          // would have been, not copy that ever actually renders.
          emptyMessage="No requested sessions."
          errorMessage="Couldn't load your requested sessions."
          sportsByKey={sportsByKey}
          currentUserId={currentUserId}
          onViewDetails={onViewDetails}
          onParticipationAction={onParticipationAction}
          isParticipationActionPending={isParticipationActionPending}
          gridClassName={gridClassName}
        />
      )}
    </section>
  );
}
