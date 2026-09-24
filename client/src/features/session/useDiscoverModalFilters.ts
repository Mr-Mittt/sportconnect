import { useState } from 'react';
import type { DiscoverFilters } from './discoverParams';
import { useDiscoverBaseFilters } from './useDiscoverBaseFilters';
import { useDiscoverTodaySessions } from './hooks/useDiscoverTodaySessions';

/**
 * CLIENT-SESSION-22 delta (2026-09-22) — `SessionDiscoverModal`'s own Discover data boundary:
 * search/location/time (shared with the full page via `useDiscoverBaseFilters`) plus a single,
 * always-today flat session list — no Date pill, no `/discover/counts`, no per-date sections. See
 * `useDiscoverFilters`'s own doc comment for why the modal and the full `/matches` page diverge
 * here now.
 *
 * **Sport dropdown (CLIENT-SESSION-29 revision, 2026-09-23):** `initialSportId` is the hosting
 * page's active sport pill (or its own first-owned-sport fallback when the pill is 'all'/absent —
 * see each host page's own `useDiscoverModalData` call site) — only the *seed* now, not a fixed
 * value. The modal's own sport dropdown (`sportId`/`onSportIdChange` below) lets the caller browse
 * a different one of their sports without leaving the modal. Re-derived from `initialSportId` every
 * time the modal transitions closed→open (not on every render while open, which would silently
 * discard an in-modal switch the moment the hosting page's own pill state re-renders for an
 * unrelated reason) — same "adjust state during render" pattern `useDiscoverBaseFilters` already
 * uses to reset selected locations when the sport changes.
 */
export function useDiscoverModalFilters(initialSportId: number | undefined, enabled: boolean) {
  const [sportId, setSportId] = useState(initialSportId);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setSportId(initialSportId);
  }

  const base = useDiscoverBaseFilters(sportId, enabled);
  const filters: DiscoverFilters = { sportId, ...base.filters };
  const today = useDiscoverTodaySessions(filters, enabled);

  return {
    ...base,
    sportId,
    onSportIdChange: setSportId,
    sessions: today.sessions,
    isLoading: today.isLoading,
    isError: today.isError,
    hasMore: today.hasMore,
    isFetchingMore: today.isFetchingMore,
    onLoadMore: today.loadMore,
  };
}
