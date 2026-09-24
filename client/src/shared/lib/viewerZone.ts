/**
 * The browser's own IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — sent as
 * `viewerZoneId` on every zone-aware listing call (`/sessions/discover`, `/upcoming?date`,
 * `/history?date|dateCount`, per backend SESSION-34/35) so the server buckets days and compares
 * times-of-day in the caller's real zone instead of falling back to `"UTC"`. Standard, ungated
 * browser API — no permission prompt.
 *
 * It is the same zone `new Date(...)` uses for local-time math, so this and
 * `toOffsetAwareIso`'s offset (`./scheduledStart`) can never disagree.
 */
export function getViewerZoneId(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
