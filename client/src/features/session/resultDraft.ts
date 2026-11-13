import type {
  RecordChangeSetRequest,
  RecordChangeSetResponse,
  RecordData,
  SessionRecord,
} from './resultTypes';

/*
 * CLIENT-GL-38: the draft behind the record dialog. It is generic over a record's `data` (the sport's
 * result schema owns that shape): everything schema-specific comes in through `DraftOptions`.
 *
 * The draft is a snapshot plus the user's edits. Each saved record keeps its database id hidden in the
 * row (the #1, #2, #3 shown are display positions only); a new row gets a client UUID. Save sends only
 * the diff against the snapshot, so an untouched row can never overwrite another player's concurrent
 * change.
 */

/** A row refused by the server on the last Save (`REJECTED`), shown at the bottom with its message. */
export interface RowRejection {
  code: string;
  params: Record<string, unknown> | null;
}

export interface DraftRow {
  /** Stable React key; survives edits and a Save. */
  key: string;
  /** The saved record's id; null for a new row. */
  id: number | null;
  /** A new row's client ref (the retry-safe key of its add); null for a saved row. */
  clientRef: string | null;
  /** The saved values (the snapshot); null for a new row. Undo restores these. */
  initial: RecordData | null;
  current: RecordData;
  /** A saved row marked for deletion (struck through). A new row is removed outright instead. */
  deleted: boolean;
  /** Display position (#n). A rejected row keeps the number it had before Save. */
  number: number;
  rejection: RowRejection | null;
}

export interface Draft {
  rows: DraftRow[];
}

/** What the draft needs to know about the sport's records. */
export interface DraftOptions {
  /** A fresh, untouched `data` for a new row. A new row equal to this is the placeholder. */
  emptyData: () => RecordData;
  /** The sport's `maxRecords`: the draft stops adding placeholders once its rows reach it. */
  maxRecords: number;
  /** Every user named in a record's `data` (sent beside it as `playerIds` so the server can check them). */
  playersOf: (data: RecordData) => string[];
  /** Test seam; defaults to `crypto.randomUUID`. */
  newRef?: () => string;
}

/** How a row relates to its snapshot. */
export type RowStatus = 'new' | 'unchanged' | 'edited' | 'deleted';

function newRef(options: DraftOptions): string {
  return (options.newRef ?? (() => crypto.randomUUID()))();
}

/** Structural equality of two JSON values (key order does not matter). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameData(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && sameData(left[key], right[key]));
}

/** A new, not yet rejected row that still equals the empty record: the always-present placeholder. */
export function isPlaceholder(row: DraftRow, options: DraftOptions): boolean {
  return row.id === null && row.rejection === null && sameData(row.current, options.emptyData());
}

export function rowStatus(row: DraftRow): RowStatus {
  if (row.id === null) return 'new';
  if (row.deleted) return 'deleted';
  return row.initial !== null && sameData(row.current, row.initial) ? 'unchanged' : 'edited';
}

/** Rows that count against `maxRecords`: everything the user would save (the placeholder and deleted rows do not). */
export function liveRowCount(draft: Draft, options: DraftOptions): number {
  return draft.rows.filter((row) => !row.deleted && !isPlaceholder(row, options)).length;
}

/** True when the draft cannot take another record: it shows the "limit reached" hint instead of a placeholder. */
export function isAtLimit(draft: Draft, options: DraftOptions): boolean {
  return liveRowCount(draft, options) >= options.maxRecords;
}

/**
 * Rows in display order: saved rows (#1, #2, ...), then new rows, then the rejected ones, with the empty
 * placeholder last.
 */
export function orderedRows(draft: Draft, options: DraftOptions): DraftRow[] {
  const saved: DraftRow[] = [];
  const added: DraftRow[] = [];
  const rejected: DraftRow[] = [];
  const placeholders: DraftRow[] = [];
  for (const row of draft.rows) {
    if (row.rejection !== null) rejected.push(row);
    else if (isPlaceholder(row, options)) placeholders.push(row);
    else if (row.id === null) added.push(row);
    else saved.push(row);
  }
  return [...saved, ...added, ...rejected, ...placeholders];
}

/** Gives every non-rejected row its #n (saved first, then new, then the placeholder); rejected rows keep theirs. */
function renumber(rows: DraftRow[], options: DraftOptions): DraftRow[] {
  const ordered = orderedRows({ rows }, options).filter((row) => row.rejection === null);
  const numbers = new Map(ordered.map((row, index) => [row.key, index + 1]));
  return rows.map((row) => (numbers.has(row.key) ? { ...row, number: numbers.get(row.key) as number } : row));
}

function newPlaceholder(options: DraftOptions): DraftRow {
  const ref = newRef(options);
  return {
    key: `new-${ref}`,
    id: null,
    clientRef: ref,
    initial: null,
    current: options.emptyData(),
    deleted: false,
    number: 0,
    rejection: null,
  };
}

/** Keeps exactly one placeholder at the end while there is room, none once the limit is reached. */
function normalize(rows: DraftRow[], options: DraftOptions): Draft {
  const existing = rows.find((row) => isPlaceholder(row, options));
  const others = rows.filter((row) => !isPlaceholder(row, options));
  const live = others.filter((row) => !row.deleted).length;
  if (live >= options.maxRecords) return { rows: renumber(others, options) };
  // Keep the placeholder that is already there (its key stays, so a field in it keeps focus).
  const placeholder: DraftRow = existing ?? newPlaceholder(options);
  return { rows: renumber([...others, placeholder], options) };
}

/** A draft over the already-valid saved records (the caller skips records its schema rejects), plus the placeholder. */
export function createDraft(records: SessionRecord[], options: DraftOptions): Draft {
  const rows: DraftRow[] = records.map((record, index) => ({
    key: `rec-${record.id}`,
    id: record.id,
    clientRef: null,
    initial: record.data,
    current: record.data,
    deleted: false,
    number: index + 1,
    rejection: null,
  }));
  return normalize(rows, options);
}

/** Replaces one row's values. Editing the placeholder takes it and a fresh placeholder appears below. */
export function editRow(draft: Draft, key: string, data: RecordData, options: DraftOptions): Draft {
  return normalize(
    draft.rows.map((row) => (row.key === key ? { ...row, current: data } : row)),
    options,
  );
}

/**
 * The red X. A saved row is marked deleted (struck through, undo available); a new row is removed
 * completely and the numbers below it shift up.
 */
export function deleteRow(draft: Draft, key: string, options: DraftOptions): Draft {
  return normalize(
    draft.rows.flatMap((row) => {
      if (row.key !== key) return [row];
      return row.id === null ? [] : [{ ...row, deleted: true }];
    }),
    options,
  );
}

/** The blue undo: back to the row's snapshot, not deleted, and its rejection message cleared. */
export function undoRow(draft: Draft, key: string, options: DraftOptions): Draft {
  return normalize(
    draft.rows.map((row) =>
      row.key === key && row.initial !== null
        ? { ...row, current: row.initial, deleted: false, rejection: null }
        : row,
    ),
    options,
  );
}

/** What Save would send: only rows that differ from their snapshot (an untouched placeholder is never sent). */
export function diffDraft(draft: Draft, options: DraftOptions): RecordChangeSetRequest {
  const changes: RecordChangeSetRequest = { add: [], update: [], delete: [] };
  for (const row of draft.rows) {
    if (row.id !== null) {
      if (row.deleted) changes.delete.push(row.id);
      else if (row.initial !== null && !sameData(row.current, row.initial)) {
        changes.update.push({ id: row.id, playerIds: options.playersOf(row.current), data: row.current });
      }
    } else if (!isPlaceholder(row, options) && row.clientRef !== null) {
      changes.add.push({ clientRef: row.clientRef, playerIds: options.playersOf(row.current), data: row.current });
    }
  }
  return changes;
}

/** Number of operations a Save would send (the server accepts at most 50 per change set). */
export function operationCount(changes: RecordChangeSetRequest): number {
  return changes.add.length + changes.update.length + changes.delete.length;
}

/**
 * Takes the server's answer. Every record the server holds becomes a fresh saved row (this includes other
 * players' changes made while the dialog was open); only the rows the server REJECTED stay as the user
 * edited them, each with its code, shown at the bottom.
 *
 * A rejected update whose record is gone (deleted meanwhile and not restored) stays as a new row; an
 * add is matched by its `clientRef`, an update by `requestedId`.
 */
export function applyResponse(
  draft: Draft,
  response: RecordChangeSetResponse,
  options: DraftOptions,
  isValid: (record: SessionRecord) => boolean = () => true,
): Draft {
  const byRef = new Map<string, RowRejection>();
  const byId = new Map<number, RowRejection>();
  for (const result of response.results) {
    if (result.status !== 'REJECTED' || result.errorCode === null) continue;
    const rejection = { code: result.errorCode, params: result.errorParams };
    if (result.clientRef !== null) byRef.set(result.clientRef, rejection);
    else if (result.requestedId !== null) byId.set(result.requestedId, rejection);
  }

  const fresh = response.records.filter(isValid);
  const freshById = new Map(fresh.map((record) => [record.id, record]));
  const kept: DraftRow[] = [];
  for (const row of draft.rows) {
    if (row.id === null && row.clientRef !== null && byRef.has(row.clientRef)) {
      kept.push({ ...row, rejection: byRef.get(row.clientRef) as RowRejection });
    } else if (row.id !== null && byId.has(row.id)) {
      const record = freshById.get(row.id);
      const rejection = byId.get(row.id) as RowRejection;
      kept.push(
        record !== undefined
          ? { ...row, initial: record.data, deleted: false, rejection }
          : { ...row, key: `new-${newRef(options)}`, id: null, clientRef: newRef(options), initial: null, deleted: false, rejection },
      );
    }
  }

  const keptIds = new Set(kept.flatMap((row) => (row.id === null ? [] : [row.id])));
  const saved: DraftRow[] = fresh
    .filter((record) => !keptIds.has(record.id))
    .map((record) => ({
      key: `rec-${record.id}`,
      id: record.id,
      clientRef: null,
      initial: record.data,
      current: record.data,
      deleted: false,
      number: 0,
      rejection: null,
    }));
  return normalize([...saved, ...kept], options);
}
