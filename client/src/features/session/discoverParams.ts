import type { FeeType, SessionStatus, StartTimeFilter } from '@/shared/types/session';

/**
 * CLIENT-SESSION-22 — the filter set shared by every `/discover`-family call
 * (`GET /sessions/discover` and `GET /sessions/discover/counts` take the same params except
 * `date`/pagination, per SESSION-39's own doc comment). `sportId` is the hosting page's active
 * sport pill, not owned by this filter state.
 *
 * `status`/`minOpenSlots`/`feeType`/`maxFeeAmountVnd` wired CLIENT-SESSION-29. `status` only ever
 * carries `PREPARING`/`SCHEDULED` — `/discover`'s own default status list dropped `ONGOING`
 * (SESSION-37) and silently strips an explicit `ONGOING` rather than 400ing on it, so offering it
 * as a filter choice would be a checkbox that visibly does nothing; `COMPLETED`/`CANCELLED` are a
 * real 400 (discover only ever returns joinable-state sessions).
 */
export interface DiscoverFilters {
  sportId: number | undefined;
  /** Debounced search-box text when `searchMode === 'sessions'`; '' = no filter. */
  title: string;
  /** OR-combined, repeated `locationId` param; `[]` = no filter. */
  locationIds: number[];
  /** `[]` = no filter (server default: `PREPARING`+`SCHEDULED`). Only `PREPARING`/`SCHEDULED` are
   * ever set here — see this interface's own doc comment for why `ONGOING` is never offered. */
  status: SessionStatus[];
  /** `undefined` = no filter. Server rejects a negative value (400) — the UI never lets one
   * through (see `DiscoverOpenSlotsFilter`). */
  minOpenSlots: number | undefined;
  feeType: FeeType | undefined;
  /** `undefined` = no filter. Independent of `feeType` — the server doesn't require `feeType`
   * `'FIXED'` to also set this (a `FREE`/`SPLIT` session's fee is fixed at 0/split, `null`
   * either way, so an amount ceiling only meaningfully narrows `FIXED` sessions in practice, but
   * nothing stops setting both or either alone). */
  maxFeeAmountVnd: number | undefined;
  startTimeFilter: StartTimeFilter | undefined;
  /** `HH:mm`, paired with `startTimeFilter` (see `StartTimeFilter`'s own doc comment for the
   * "either alone" rules). */
  startTime: string | undefined;
  /** The browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), sent on every
   * call so `date`'s day boundary and `startTime`'s time-of-day comparison evaluate in the
   * caller's real zone instead of falling back to UTC server-side. */
  viewerZoneId: string;
}

// Moved to shared/lib in CLIENT-SESSION-24 so the My-sessions history/upcoming calls
// (CLIENT-SESSION-23) can send the same zone without importing from Discover; re-exported so
// every existing importer keeps working.
export { getViewerZoneId } from '@/shared/lib/viewerZone';

/** Stable, cache-key-safe serialization — sorts `locationIds`/`status` so checking the same
 * values in a different order doesn't miss the cache. Used by both `queryKeys.ts`'s discover
 * builders and the request-param builders below, so the key always reflects exactly what was sent. */
export function serializeDiscoverFilters(filters: DiscoverFilters): string {
  return JSON.stringify({
    ...filters,
    locationIds: [...filters.locationIds].sort((a, b) => a - b),
    status: [...filters.status].sort(),
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
    ...(filters.status.length > 0 ? { status: filters.status } : {}),
    ...(filters.minOpenSlots !== undefined ? { minOpenSlots: filters.minOpenSlots } : {}),
    ...(filters.feeType !== undefined ? { feeType: filters.feeType } : {}),
    ...(filters.maxFeeAmountVnd !== undefined ? { maxFeeAmountVnd: filters.maxFeeAmountVnd } : {}),
    ...(filters.startTimeFilter !== undefined ? { startTimeFilter: filters.startTimeFilter } : {}),
    ...(filters.startTime !== undefined ? { startTime: filters.startTime } : {}),
    viewerZoneId: filters.viewerZoneId,
  };
}
