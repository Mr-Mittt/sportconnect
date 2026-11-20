import type { PickerMember } from '@/shared/components/MemberPicker';
import { clockTime } from '@/shared/lib/recurrenceDay';
import { GAME_MOOD_DEFAULT } from '@/shared/lib/gameMood';
import type { Location } from '@/shared/types/location';
import type { FeeType } from '@/shared/types/session';
import type { GroupSessionAudience } from '@/features/session/types';
import type { GroupSessionRecurrence, RecurrenceMissingField } from './types';

/** CLIENT-GROUP-SESSION-5: what the recurrence form edits. The location and the attributes live in the form's data hook (the picker and the sport's schema own them). */
export interface RecurrenceFormValues {
  /** 1 to 7 (Monday = 1) for a weekly group, 1 to 31 for a monthly one. */
  dayKey: number;
  /** The wall-clock start, `HH:mm`. */
  start: string;
  /** Whole minutes, `''` while unknown. */
  duration: string;
  locationNote: string;
  audience: GroupSessionAudience;
  audienceMembers: PickerMember[];
  /** `undefined` = nothing ticked; the server reads that as free. */
  feeType: FeeType | undefined;
  feeAmountVnd: string;
  feeNote: string;
  gameMood: number;
}

/** A new configuration: the first day of the mode, 18:00, free, no location and no duration (so, until the owner fills them, a draft). */
export const DEFAULT_START = '18:00';

export function emptyRecurrenceValues(): RecurrenceFormValues {
  return {
    dayKey: 1,
    start: DEFAULT_START,
    duration: '',
    locationNote: '',
    audience: 'ALL_MEMBERS',
    audienceMembers: [],
    feeType: 'FREE',
    feeAmountVnd: '',
    feeNote: '',
    gameMood: GAME_MOOD_DEFAULT,
  };
}

/** The form of an existing configuration, for Edit. */
export function valuesFromRecurrence(recurrence: GroupSessionRecurrence): RecurrenceFormValues {
  return {
    dayKey: recurrence.dayKey,
    start: clockTime(recurrence.startTime),
    duration: recurrence.durationMinutes === null ? '' : String(recurrence.durationMinutes),
    locationNote: recurrence.locationNote ?? '',
    audience: recurrence.audience,
    audienceMembers: recurrence.audienceMembers.map((member) => ({ id: member.id, name: member.name, avatarUrl: member.avatarUrl })),
    feeType: recurrence.feeType,
    feeAmountVnd: recurrence.feeAmountVnd === null ? '' : String(recurrence.feeAmountVnd),
    feeNote: recurrence.feeNote ?? '',
    gameMood: recurrence.gameMood,
  };
}

/** What a configuration still lacks to generate a session, in the server's own words (`GroupSessionConfigServiceImpl.missingFields`): a location, a duration, a fixed fee's amount. */
export function missingForRecurrence(input: {
  location: Location | null;
  duration: string;
  feeType: FeeType | undefined;
  feeAmountVnd: string;
}): RecurrenceMissingField[] {
  const missing: RecurrenceMissingField[] = [];
  if (input.location === null) missing.push('locationId');
  if (input.duration === '') missing.push('durationMinutes');
  if (input.feeType === 'FIXED' && input.feeAmountVnd === '') missing.push('feeAmountVnd');
  return missing;
}

/** `POST` / `PUT /api/sessions/group/{groupId}/recurrences` body. */
export interface RecurrencePayload {
  dayKey: number;
  startTime: string;
  durationMinutes?: number;
  locationId?: number;
  locationNote?: string;
  audience: GroupSessionAudience;
  audienceUserIds?: string[];
  feeType?: FeeType;
  feeAmountVnd?: number;
  feeNote?: string;
  gameMood: number;
  attributes?: Record<string, unknown>;
}

/**
 * The request for a form: optional fields the owner left empty are left out (the server saves a draft for a missing location, duration or fixed
 * amount), a `SPECIFIC` audience sends its member ids and an everyone audience none, a fee amount only goes with `FIXED`.
 */
export function toRecurrencePayload(
  values: RecurrenceFormValues,
  location: Location | null,
  attributes: Record<string, unknown> | undefined,
): RecurrencePayload {
  return {
    dayKey: values.dayKey,
    startTime: values.start,
    durationMinutes: values.duration !== '' ? Number(values.duration) : undefined,
    locationId: location?.id,
    locationNote: values.locationNote.trim() || undefined,
    audience: values.audience,
    audienceUserIds: values.audience === 'SPECIFIC' ? values.audienceMembers.map((member) => member.id) : undefined,
    feeType: values.feeType,
    feeAmountVnd: values.feeType === 'FIXED' && values.feeAmountVnd !== '' ? Number(values.feeAmountVnd) : undefined,
    feeNote: values.feeNote.trim() || undefined,
    gameMood: values.gameMood,
    attributes,
  };
}
