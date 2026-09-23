import type { FeeType, StartTimeFilter } from '@/shared/types/session';

/**
 * CLIENT-SESSION-22 — the filter set shared by every `/discover`-family call
 * (`GET /sessions/discover` and `GET /sessions/discover/counts` take the same params except
 * `date`/pagination, per SESSION-39's own doc comment). `sportId` is the hosting page's active
 * sport pill, not owned by this filter state. `feeType`/`minOpenSlots`/`maxFeeAmountVnd` stay
 * out of scope (CLIENT-SESSION-22's own "Out of scope" — no pill wires them); `feeType`'s field
 * is kept here anyway (always `undefined` today) so a future ticket adding that pill only needs
 * to set it, not thread a new param through every call site again.
 */
export interface DiscoverFilters {
  sportId: number | undefined;
  /** Debounced search-box text when `searchMode === 'sessions'`; '' = no filter. */
  title: string;
  /** OR-combined, repeated `locationId` param; `[]` = no filter. */
  locationIds: number[];
  feeType: FeeType | undefined;
  startTimeFilter: StartTimeFilter | undefined;
  /** `HH:mm`, paired with `startTimeFilter` (see `StartTimeFilter`'s own doc comment for the
   * "either alone" rules). */
  startTime: string | undefined;
  /** The browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), sent on every
   * call so `date`'s day boundary and `startTime`'s time-of-day comparison evaluate in the
   * caller's real zone instead of falling back to UTC server-side. */
  viewerZoneId: string;
}

export function getViewerZoneId(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Stable, cache-key-safe serialization — sorts `locationIds` so checking the same two locations
 * in a different order doesn't miss the cache. Used by both `queryKeys.ts`'s discover builders
 * and the request-param builders below, so the key always reflects exactly what was sent. */
export function serializeDiscoverFilters(filters: DiscoverFilters): string {
  return JSON.stringify({
    ...filters,
    locationIds: [...filters.locationIds].sort((a, b) => a - b),
  });
}

/** Builds the query params every `/discover`-family request sends except `date`/pagination —
 * `undefined`/empty fields are omitted entirely rather than sent as `null`/`''`, matching every
 * other optional-param hook in this feature (e.g. `useDiscoverSessions`'s old `sportId` handling). */
export function buildDiscoverParams(filters: DiscoverFilters): Record<string, unknown> {
  return {
    ...(filters.sportId !== undefined ? { sportId: filters.sportId } : {}),
    ...(filters.title !== '' ? { title: filters.title } : {}),
    ...(filters.locationIds.length > 0 ? { locationId: filters.locationIds } : {}),
    ...(filters.feeType !== undefined ? { feeType: filters.feeType } : {}),
    ...(filters.startTimeFilter !== undefined ? { startTimeFilter: filters.startTimeFilter } : {}),
    ...(filters.startTime !== undefined ? { startTime: filters.startTime } : {}),
    viewerZoneId: filters.viewerZoneId,
  };
}
