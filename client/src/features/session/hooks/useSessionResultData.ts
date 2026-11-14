import { useMemo } from 'react';
import { useLocaleStore } from '@/app/localeStore';
import { useResultSchema } from '@/shared/hooks/useResultSchema';
import { getApiError } from '@/shared/lib/apiError';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import { getResultAccess, type ResultAccess } from '../resultAccess';
import { buildPlayerNames, type PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import type { Session, SessionParticipant } from '../types';
import { useSessionRecords } from './useSessionRecords';

/** Everything `SessionDetailModal` needs to show the Result section and its dialog. */
export interface SessionResultData {
  /** The sport's parsed record schema; `null` = no (or an unsupported) schema: the section stays hidden. */
  schema: RecordSchema | null;
  access: ResultAccess;
  /** `undefined` while loading. */
  records: SessionRecord[] | undefined;
  isLoading: boolean;
  /** A failure other than 403 (a 403 hides the section instead, like the Discussion section). */
  isError: boolean;
  isForbidden: boolean;
  names: PlayerNames;
  /** The JOINED participants a record's players can be picked from, in roster order. */
  playerIds: string[];
  locale: 'en' | 'vi';
}

/**
 * CLIENT-GL-38: the data behind the session detail's Result section: the sport's result schema (parsed;
 * hidden when missing or unsupported), who may see and edit it (`getResultAccess`), and the records,
 * fetched only while the section is visible. Called by `useSessionDetailModalData`.
 */
export function useSessionResultData(
  session: Session | undefined,
  sessionId: number | null,
  participants: SessionParticipant[],
): SessionResultData {
  const locale = useLocaleStore((state) => state.locale);
  const rawSchema = useResultSchema(session?.sportId);
  const schema = useMemo(() => parseRecordSchema(rawSchema.data), [rawSchema.data]);
  const access: ResultAccess =
    session === undefined ? { visible: false } : getResultAccess(session, schema !== null, new Date());
  const recordsQuery = useSessionRecords(sessionId ?? undefined, access.visible);
  const isForbidden = recordsQuery.isError && getApiError(recordsQuery.error).category === 'FORBIDDEN';
  const names = useMemo(() => buildPlayerNames(participants), [participants]);
  const playerIds = useMemo(() => participants.map((participant) => participant.userId), [participants]);

  return {
    schema,
    access: isForbidden ? { visible: false } : access,
    records: recordsQuery.data,
    isLoading: recordsQuery.isLoading,
    isError: recordsQuery.isError && !isForbidden,
    isForbidden,
    names,
    playerIds,
    locale: locale === 'vi' ? 'vi' : 'en',
  };
}
