import i18next from 'i18next';

/** Backfill sentinel for sessions created before SESSION-5 (and auto-generated
 * `GROUP_RECURRING` sessions, which have no capacity input at all) — means "uncapped", never a
 * real limit the creator chose, so read-side displays hide the denominator at this value. */
export const UNCAPPED_CAPACITY = 9999;

/** `"3/10 participants"` once a real capacity was chosen, else the plain `"12 participants"`
 * (unchanged pre-SESSION-5 behavior) for the `UNCAPPED_CAPACITY` sentinel. */
export function formatParticipantCount(participantCount: number, capacity: number): string {
  if (capacity === UNCAPPED_CAPACITY) {
    return i18next.t('session:capacity.participants', { count: participantCount });
  }
  return i18next.t('session:capacity.participantsOfCapacity', { count: participantCount, capacity });
}
