// CLIENT-GL-38: session result records (game logging). Typed 1:1 against
// modules/session/session-api/.../dto/{SessionRecordDto,RecordChangeSetRequest,RecordChangeSetResponse,
// RecordOperationResult,RecordOperationStatus}.java (SESSION-50). The server stores a record's `data`
// as the client sent it, so `RecordData` is opaque here: the sport's result schema decides its shape.

/** A record's payload. Players, sides, winner and scores all live inside; the server never reads it. */
export type RecordData = Record<string, unknown>;

/** `GET /api/sessions/{id}/records` item (oldest first). There is no `players` field: read it from `data`. */
export interface SessionRecord {
  id: number;
  data: RecordData;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

/** Mirrors `RecordOperationStatus`. `REJECTED` = this one operation was refused, the others were applied. */
export type RecordOperationStatus = 'CREATED' | 'UPDATED' | 'RESTORED' | 'DELETED' | 'UNCHANGED' | 'REJECTED';

/** The `SESSION_RECORD_*` codes a REJECTED operation can carry. */
export type RecordRejectionCode =
  | 'SESSION_RECORD_INVALID'
  | 'SESSION_RECORD_TOO_LARGE'
  | 'SESSION_RECORD_PLAYER_NOT_JOINED'
  | 'SESSION_RECORD_LIMIT_REACHED';

export interface RecordAddOperation {
  /** Client-generated UUID: a retried request never stores the record twice. */
  clientRef: string;
  /** Every user named in `data`; the server checks they are JOINED and does not store the list. */
  playerIds: string[];
  data: RecordData;
}

export interface RecordUpdateOperation {
  id: number;
  playerIds: string[];
  data: RecordData;
}

export interface RecordChangeSetRequest {
  add: RecordAddOperation[];
  update: RecordUpdateOperation[];
  delete: number[];
}

export interface RecordOperationResult {
  /** An add's client ref; null for an update or delete. */
  clientRef: string | null;
  /** The id an update or delete was asked to change; null for an add. */
  requestedId: number | null;
  /** The resulting record id (new for an add or a restore); null for a delete. */
  id: number | null;
  status: RecordOperationStatus;
  /** Set only when `status` is REJECTED. */
  errorCode: string | null;
  /** `{ maxBytes }` or `{ maxRecords }` for the codes that have one. */
  errorParams: Record<string, unknown> | null;
}

export interface RecordChangeSetResponse {
  results: RecordOperationResult[];
  /** All records of the session after the change set, oldest first. */
  records: SessionRecord[];
}

/** The server's cap on operations in one change set (`RecordChangeSetRequest`). */
export const MAX_RECORD_OPERATIONS = 50;
/** The server's fixed cap on one record's serialized `data`, in UTF-8 bytes. */
export const MAX_RECORD_BYTES = 4096;
/** How long after `scheduledEndAt` a session's records can still be changed. */
export const RECORD_WINDOW_MS = 24 * 60 * 60 * 1000;
