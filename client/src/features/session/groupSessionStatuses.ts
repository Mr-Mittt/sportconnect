import type { SessionStatus } from '@/shared/types/session';

/** The three sections of a group's Sessions tab (CLIENT-GROUP-SESSION-2). */
export type GroupSessionSection = 'today' | 'others' | 'history';

/**
 * Which statuses each section's filter offers, in the order the dropdown lists them (owner, 2026-11-20). They match what the
 * server serves per endpoint (SESSION-GROUP-12): `/today` any of the five, `/later` PREPARING, SCHEDULED, CANCELLED,
 * `/history` COMPLETED, CANCELLED.
 */
export const GROUP_SESSION_STATUS_OPTIONS: Record<GroupSessionSection, readonly SessionStatus[]> = {
  today: ['ONGOING', 'SCHEDULED', 'PREPARING', 'COMPLETED', 'CANCELLED'],
  others: ['PREPARING', 'SCHEDULED', 'CANCELLED'],
  history: ['COMPLETED', 'CANCELLED'],
};

/** What each section starts with (and what its filter falls back to on a new browser session). */
export const GROUP_SESSION_STATUS_DEFAULTS: Record<GroupSessionSection, readonly SessionStatus[]> = {
  today: ['ONGOING', 'SCHEDULED', 'PREPARING'],
  others: ['PREPARING', 'SCHEDULED'],
  history: ['COMPLETED'],
};

/** What the Posts-tab shortcut asks `/today` for: the sessions that are still to be played or under way. */
export const SHORTCUT_STATUSES: readonly SessionStatus[] = ['ONGOING', 'SCHEDULED', 'PREPARING'];

/**
 * A selection in the order its section lists the options, with anything the section does not offer dropped. A stable order
 * keeps the query key and the `status` the server sees the same however the user ticked the boxes.
 */
export function orderedStatuses(section: GroupSessionSection, selected: readonly SessionStatus[]): SessionStatus[] {
  return GROUP_SESSION_STATUS_OPTIONS[section].filter((status) => selected.includes(status));
}

/** The `status` query value: comma-separated (the server reads repeated or comma-separated; axios would send `status[]=`). */
export function statusParam(statuses: readonly SessionStatus[]): string {
  return statuses.join(',');
}
