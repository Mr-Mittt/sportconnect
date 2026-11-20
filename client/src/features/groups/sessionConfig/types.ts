import type { Location } from '@/shared/types/location';
import type { FeeType } from '@/shared/types/session';
import type { GroupSessionAudience } from '@/features/session/types';

/** CLIENT-GROUP-SESSION-4 (SESSION-GROUP-4): how a group's regular sessions repeat. A configuration is a weekday (`WEEKLY`, Monday = 1) or a day of the month (`MONTHLY`, 1 to 31). */
export type RecurrenceMode = 'WEEKLY' | 'MONTHLY';

/** `GET/PUT /api/sessions/group/{groupId}/settings`. A group that never saved is `enabled: false`, `WEEKLY`. `cancelledSessions` is how many scheduled regular sessions the last call cancelled. */
export interface GroupSessionSettings {
  groupId: number;
  enabled: boolean;
  mode: RecurrenceMode;
  cancelledSessions: number;
}

/**
 * Partial update: send only what changes. `cancelScheduled` counts only on a call that turns generation off or switches the mode (the server
 * ignores it otherwise): `true` cancels the group's scheduled regular sessions, `false` or omitted leaves them there.
 */
export interface UpdateGroupSessionSettingsPayload {
  enabled?: boolean;
  mode?: RecurrenceMode;
  cancelScheduled?: boolean;
}

/** What a configuration still lacks to generate a session; a configuration that lacks any is a draft. */
export type RecurrenceMissingField = 'locationId' | 'durationMinutes' | 'feeAmountVnd';

/** One recurrence configuration (`GET .../recurrences` answers every configuration of both modes). */
export interface GroupSessionRecurrence {
  id: number;
  groupId: number;
  mode: RecurrenceMode;
  /** 1 to 7 (Monday = 1) for `WEEKLY`, 1 to 31 for `MONTHLY`. */
  dayKey: number;
  /** The wall-clock start in the location's zone, `HH:mm:ss`. */
  startTime: string;
  durationMinutes: number | null;
  locationId: number | null;
  /** The resolved `locationId` (null when there is none or it is no longer available). */
  location: Location | null;
  locationNote: string | null;
  audience: GroupSessionAudience;
  audienceUserIds: string[];
  feeType: FeeType;
  feeAmountVnd: number | null;
  feeNote: string | null;
  gameMood: number;
  attributes: Record<string, unknown> | null;
  draft: boolean;
  missing: RecurrenceMissingField[];
  createdAt: string;
  updatedAt: string;
}
