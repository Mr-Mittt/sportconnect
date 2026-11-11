import type { Session } from '@/shared/types/session';

/** "Who can join": anyone, or seats reserved by gender among the open ones. */
export type WhoCanJoin = 'ANYONE' | 'BY_GENDER';

/** The open seats the creator offers: capacity minus the taken ones (`initialSlot` + the creator). */
export function openSlotsOf(session: Pick<Session, 'capacity' | 'initialSlot'>): number {
  return Math.max(0, session.capacity - (session.initialSlot + 1));
}

/** True when a session reserves seats by gender (either count above 0; `0` is "not specified"). */
export function isByGender(maleSlots: number | null | undefined, femaleSlots: number | null | undefined): boolean {
  return (maleSlots ?? 0) > 0 || (femaleSlots ?? 0) > 0;
}

/** Male + female may not exceed the open slots (mirrors `SESSION_GENDER_SLOTS_EXCEED_OPEN`). */
export function exceedsOpenSlots(open: number, male: number, female: number): boolean {
  return male + female > open;
}

/** The gender split in the summary form: `"2 male - 1 female"`, or `""` when none is reserved. */
export function genderSplitText(
  maleSlots: number | null | undefined,
  femaleSlots: number | null | undefined,
  labels: { male: string; female: string },
): string {
  const parts: string[] = [];
  if ((maleSlots ?? 0) > 0) parts.push(`${maleSlots} ${labels.male}`);
  if ((femaleSlots ?? 0) > 0) parts.push(`${femaleSlots} ${labels.female}`);
  return parts.join(' - ');
}
