/**
 * CLIENT-ADMIN-IMPORT-1: the shapes of the SESSION-70 import (`POST /api/sessions/import/preview` and `/import`), typed 1:1
 * from the Java DTOs (`ImportSessionsRequest`, `ImportPreviewResponse`, `ImportApplyResponse`), and of the file the
 * SESSION-71 script writes.
 */

/** One game: the winning side and the losing side, each one or two names as the sheet writes them. No score. */
export interface ImportedGame {
  winners: string[];
  losers: string[];
}

/** One finished session. `localDate` is `YYYY-MM-DD` and the times `HH:MM`, read in the location's timezone by the server. */
export interface ImportedSession {
  title: string;
  localDate: string;
  startTime: string;
  endTime: string;
  games: ImportedGame[];
}

/** The file made by `documentation/scripts/import-sessions` (SESSION-71). */
export interface ImportFile {
  sheet?: string;
  sessions: ImportedSession[];
}

/** The body of both calls. `aliases` maps a sheet name to the member it stands for (a user id). */
export interface ImportRequest {
  groupId: number;
  locationId: number;
  aliases?: Record<string, string>;
  sessions: ImportedSession[];
}

/** An active member of the group. */
export interface ImportCandidate {
  userId: string;
  fullName: string;
}

/** A name as written, and the member it resolved to (`userId` is null or absent while it is unresolved). */
export interface ImportPreviewPlayer {
  name: string;
  userId?: string | null;
  fullName?: string | null;
}

export interface ImportPreviewGame {
  winners: ImportPreviewPlayer[];
  losers: ImportPreviewPlayer[];
}

/** A session as it would be created. `exists` is true when the same group, title and start are already there. */
export interface ImportPreviewSession {
  title: string;
  localDate: string;
  scheduledStart: string;
  scheduledEndAt: string;
  exists: boolean;
  games: ImportPreviewGame[];
}

/** A name that matched no member (no candidates) or several (the candidates). */
export interface ImportUnresolvedName {
  name: string;
  candidates: ImportCandidate[];
}

export interface ImportPreview {
  hostUserId: string;
  sessions: ImportPreviewSession[];
  unresolved: ImportUnresolvedName[];
  canApply: boolean;
  /** The group's active members, by name: what an unresolved name can be settled with. */
  members: ImportCandidate[];
}

/** `CREATED`: made now. `SKIPPED`: already there. `FAILED`: an unexpected error for that session only. */
export type ImportSessionStatus = 'CREATED' | 'SKIPPED' | 'FAILED';

export interface ImportSessionResult {
  title: string;
  localDate: string;
  status: ImportSessionStatus;
  sessionId?: number | null;
}

export interface ImportApplyResult {
  created: number;
  skipped: number;
  failed: number;
  results: ImportSessionResult[];
}
