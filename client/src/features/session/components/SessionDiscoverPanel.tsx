import { IconSearch } from '@tabler/icons-react';
import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem, SessionSearchMode } from '../types';

/** Only 'sessions' filters for real (see `discoverSearch.ts`) — 'location'/'gear' render
 * disabled since this app has no location/gear search or gear/equipment domain yet. */
const SEARCH_MODE_OPTIONS: { value: SessionSearchMode; label: string; disabled?: boolean }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'location', label: 'Location', disabled: true },
  { value: 'gear', label: 'Gear', disabled: true },
];

/** Rendered inert (aria-disabled, no handler) — CLIENT-SESSION-6 shipped the visual affordance
 * only, real filtering behavior is a follow-up once there's a design for what each one opens. */
const FILTER_PILL_LABELS = ['Date', 'Time', 'Location'];

const DEFAULT_GRID_CLASS_NAME = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

interface SessionDiscoverPanelProps {
  searchMode: SessionSearchMode;
  onSearchModeChange: (mode: SessionSearchMode) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;

  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-9: threaded straight through to each `SessionCard`. */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;

  /** Defaults to a fixed 2-column grid. `MatchesPage` overrides this to flip to 3 columns when
   * its "My sessions" panel is collapsed — `SessionDiscoverModal` uses the default. */
  gridClassName?: string;
}

/**
 * CLIENT-SESSION-6's Discover UI (search + inert filter pills + results grid), extracted in
 * CLIENT-SESSION-7 so it can render both inline on `MatchesPage` and inside
 * `SessionDiscoverModal` (the rail's "Join a match" entry point on Home Feed/Groups/Friends)
 * without the two drifting apart. Presentational — all state lives in the caller's data hook.
 */
export function SessionDiscoverPanel({
  searchMode,
  onSearchModeChange,
  searchText,
  onSearchTextChange,
  sessions,
  isLoading,
  isError,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  gridClassName = DEFAULT_GRID_CLASS_NAME,
}: SessionDiscoverPanelProps) {
  return (
    <section aria-label="Discover sessions" className="min-w-0 flex-1">
      <h2 className="sr-only">Discover</h2>
      <div className="mb-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <select
            value={searchMode}
            onChange={(event) => onSearchModeChange(event.target.value as SessionSearchMode)}
            aria-label="Search scope"
            className="border-hairline cursor-pointer rounded-lg border-border bg-surface-2 px-2.5 py-2 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {SEARCH_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <IconSearch
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="Search"
              aria-label="Search sessions"
              className="border-hairline w-full rounded-lg border-border bg-surface-2 py-2 pr-2.5 pl-8 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_PILL_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              aria-disabled="true"
              title="Filtering by this isn't available yet"
              className="border-hairline cursor-not-allowed rounded-full border-border bg-surface-1 px-3 py-1.5 text-xs text-text-secondary"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load sessions to discover.
        </p>
      )}
      {!isLoading && !isError && sessions.length === 0 && (
        <p className="text-2sm text-text-muted">
          {searchText.trim() === ''
            ? 'No sessions to discover for this sport yet.'
            : 'No sessions match your search.'}
        </p>
      )}
      {!isLoading && !isError && sessions.length > 0 && (
        <div className={gridClassName}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              sportsByKey={sportsByKey}
              currentUserId={currentUserId}
              onViewDetails={onViewDetails}
              onParticipationAction={onParticipationAction}
              isParticipationActionPending={isParticipationActionPending}
            />
          ))}
        </div>
      )}
    </section>
  );
}
