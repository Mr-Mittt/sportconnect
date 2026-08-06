import type { Session } from '@/shared/types/session';
import type { SessionListItem, SessionSearchMode } from './types';

/**
 * Maps raw `GET /sessions/discover` results into `SessionListItem`s (always `groupName: null` —
 * discover is standalone-only) and applies the search box's client-side filter. Only the
 * 'sessions' search mode actually filters (title/location substring match); 'location'/'gear'
 * have no wired behavior yet (client/CLAUDE.md — no gear/equipment domain exists), so any query
 * typed while one of those is selected is ignored. Shared by `useMatchesPageData`'s inline
 * Discover panel and `useDiscoverModalData`'s rail-triggered modal so the two never drift.
 */
export function filterDiscoverSessions(
  content: Session[],
  searchMode: SessionSearchMode,
  searchText: string,
): SessionListItem[] {
  const withGroupName = content.map((session) => ({ ...session, groupName: null }));
  const query = searchMode === 'sessions' ? searchText.trim().toLowerCase() : '';
  if (query === '') return withGroupName;
  return withGroupName.filter((session) => {
    const title = session.title ?? `${session.sportName} session`;
    return (
      title.toLowerCase().includes(query) || session.location.name.toLowerCase().includes(query)
    );
  });
}
