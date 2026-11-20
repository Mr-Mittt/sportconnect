import { getViewerZoneId } from './viewerZone';

/** `yyyy-MM-dd` of `instant` read on the wall clock of `zone` (the `en-CA` locale prints exactly that shape). */
function dateInZone(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * The zone a session's "today" is read in: the **location's own zone** when the session has one with a known zone,
 * otherwise the **viewer's** (`scheduledStart` is a raw UTC instant with no zone of its own, SESSION-33). An unknown
 * zone name falls back to the viewer's too, so a bad value never throws on screen.
 */
export function zoneForSession(session: { location: { timezone?: string | null } | null }): string {
  const zone = session.location?.timezone;
  if (zone === undefined || zone === null || zone === '') return getViewerZoneId();
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    return getViewerZoneId();
  }
}

/**
 * Is the session on today's date? It is when today falls from the day it **starts** to the day it **ends** (both included):
 * one that started yesterday and ends today, or ends tomorrow, is today's too (owner, 2026-11-20). With no end time only
 * its start day counts. Everything is read in the same zone (`zoneForSession`), so a 19:00 session at the venue is
 * "today" for everyone who looks at it on the venue's day, whatever zone they are in. The group-session design reads days
 * on the location's wall clock (`GROUP_SESSION_DESIGN.md` decision 6).
 */
export function isSessionToday(
  session: { scheduledStart: string; scheduledEndAt?: string | null; location: { timezone?: string | null } | null },
  now: Date = new Date(),
): boolean {
  const zone = zoneForSession(session);
  const today = dateInZone(now, zone);
  const startDay = dateInZone(new Date(session.scheduledStart), zone);
  const endDay =
    session.scheduledEndAt !== undefined && session.scheduledEndAt !== null
      ? dateInZone(new Date(session.scheduledEndAt), zone)
      : startDay;
  // `yyyy-MM-dd` strings compare in date order; an end before the start (bad data) falls back to the start day.
  return startDay <= today && today <= (endDay >= startDay ? endDay : startDay);
}
