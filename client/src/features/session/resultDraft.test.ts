import { describe, expect, it } from 'vitest';
import {
  applyResponse,
  createDraft,
  deleteRow,
  diffDraft,
  editRow,
  isAtLimit,
  operationCount,
  orderedRows,
  rowStatus,
  sameData,
  undoRow,
  type Draft,
  type DraftOptions,
} from './resultDraft';
import type { RecordChangeSetResponse, RecordOperationResult, SessionRecord } from './resultTypes';

let counter = 0;
function options(maxRecords = 100): DraftOptions {
  return {
    emptyData: () => ({ text: '' }),
    maxRecords,
    playersOf: (data) => [String(data.text)],
    newRef: () => `ref-${++counter}`,
  };
}

function record(id: number, text: string): SessionRecord {
  return { id, data: { text }, createdBy: 'u', createdAt: '', updatedBy: null, updatedAt: '' };
}

function result(partial: Partial<RecordOperationResult>): RecordOperationResult {
  return { clientRef: null, requestedId: null, id: null, status: 'UNCHANGED', errorCode: null, errorParams: null, ...partial };
}

function labels(draft: Draft, o: DraftOptions): string[] {
  return orderedRows(draft, o).map((row) => `#${row.number}:${String(row.current.text)}`);
}

function take(draft: Draft, o: DraftOptions, text: string): Draft {
  const placeholder = orderedRows(draft, o).at(-1);
  if (placeholder === undefined) throw new Error('no placeholder');
  return editRow(draft, placeholder.key, { text }, o);
}

describe('createDraft', () => {
  it('numbers saved records from 1 and ends with one empty placeholder', () => {
    const o = options();
    const draft = createDraft([record(10, 'a'), record(11, 'b')], o);
    expect(labels(draft, o)).toEqual(['#1:a', '#2:b', '#3:']);
    expect(operationCount(diffDraft(draft, o))).toBe(0);
  });

  it('keeps no placeholder when the session is already at maxRecords', () => {
    const o = options(2);
    const draft = createDraft([record(10, 'a'), record(11, 'b')], o);
    expect(labels(draft, o)).toEqual(['#1:a', '#2:b']);
    expect(isAtLimit(draft, o)).toBe(true);
  });
});

describe('placeholder and new rows', () => {
  it('taking the placeholder adds a fresh one below, numbered after it', () => {
    const o = options();
    let draft = createDraft([record(10, 'a'), record(11, 'b'), record(12, 'c')], o);
    draft = take(draft, o, 'd');
    draft = take(draft, o, 'e');
    expect(labels(draft, o)).toEqual(['#1:a', '#2:b', '#3:c', '#4:d', '#5:e', '#6:']);
  });

  it('keeps the placeholder row (same key) through unrelated edits', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    const before = orderedRows(draft, o).at(-1)?.key;
    draft = editRow(draft, 'rec-10', { text: 'z' }, o);
    expect(orderedRows(draft, o).at(-1)?.key).toBe(before);
  });

  it('removes a new row completely on delete and shifts the numbers below it up', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = take(draft, o, 'b');
    draft = take(draft, o, 'c');
    const second = orderedRows(draft, o)[1];
    draft = deleteRow(draft, second.key, o);
    expect(labels(draft, o)).toEqual(['#1:a', '#2:c', '#3:']);
    expect(diffDraft(draft, o).add.map((op) => op.data.text)).toEqual(['c']);
  });

  it('stops adding placeholders at maxRecords and brings one back when a row is freed', () => {
    const o = options(2);
    let draft = createDraft([record(10, 'a')], o);
    draft = take(draft, o, 'b');
    expect(isAtLimit(draft, o)).toBe(true);
    expect(labels(draft, o)).toEqual(['#1:a', '#2:b']);
    draft = deleteRow(draft, 'rec-10', o);
    expect(isAtLimit(draft, o)).toBe(false);
    expect(orderedRows(draft, o).at(-1)?.current.text).toBe('');
  });

  it('never sends the untouched placeholder', () => {
    const o = options();
    const draft = createDraft([], o);
    expect(operationCount(diffDraft(draft, o))).toBe(0);
  });
});

describe('row actions', () => {
  it('delete marks a saved row (struck through) and undo restores it', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = deleteRow(draft, 'rec-10', o);
    expect(rowStatus(draft.rows.find((r) => r.key === 'rec-10')!)).toBe('deleted');
    expect(diffDraft(draft, o).delete).toEqual([10]);
    draft = undoRow(draft, 'rec-10', o);
    expect(rowStatus(draft.rows.find((r) => r.key === 'rec-10')!)).toBe('unchanged');
    expect(operationCount(diffDraft(draft, o))).toBe(0);
  });

  it('an edit turns the row into edited and undo returns to the snapshot values', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = editRow(draft, 'rec-10', { text: 'changed' }, o);
    expect(rowStatus(draft.rows[0])).toBe('edited');
    expect(diffDraft(draft, o).update).toEqual([{ id: 10, playerIds: ['changed'], data: { text: 'changed' } }]);
    draft = undoRow(draft, 'rec-10', o);
    expect(draft.rows[0].current).toEqual({ text: 'a' });
    expect(operationCount(diffDraft(draft, o))).toBe(0);
  });

  it('editing a row back to its saved values is no change', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = editRow(draft, 'rec-10', { text: 'x' }, o);
    draft = editRow(draft, 'rec-10', { text: 'a' }, o);
    expect(rowStatus(draft.rows[0])).toBe('unchanged');
  });
});

describe('diffDraft', () => {
  it('sends only the changed rows, in add / update / delete groups', () => {
    const o = options();
    let draft = createDraft([record(10, 'a'), record(11, 'b'), record(12, 'c')], o);
    draft = editRow(draft, 'rec-10', { text: 'a2' }, o);
    draft = deleteRow(draft, 'rec-11', o);
    draft = take(draft, o, 'n');
    const changes = diffDraft(draft, o);
    expect(changes.update.map((op) => op.id)).toEqual([10]);
    expect(changes.delete).toEqual([11]);
    expect(changes.add).toHaveLength(1);
    expect(changes.add[0].data).toEqual({ text: 'n' });
    expect(changes.add[0].clientRef).toMatch(/^ref-/);
    expect(operationCount(changes)).toBe(3);
  });
});

describe('applyResponse', () => {
  it('replaces the draft with the fresh list, including other players changes', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = take(draft, o, 'n');
    const ref = diffDraft(draft, o).add[0].clientRef;
    const response: RecordChangeSetResponse = {
      results: [result({ clientRef: ref, id: 12, status: 'CREATED' })],
      records: [record(10, 'a'), record(11, 'by-someone-else'), record(12, 'n')],
    };
    const next = applyResponse(draft, response, o);
    expect(labels(next, o)).toEqual(['#1:a', '#2:by-someone-else', '#3:n', '#4:']);
    expect(operationCount(diffDraft(next, o))).toBe(0);
  });

  it('keeps only REJECTED rows, at the bottom, with their code and the number they had', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = take(draft, o, 'good');
    draft = take(draft, o, 'bad');
    const adds = diffDraft(draft, o).add;
    const response: RecordChangeSetResponse = {
      results: [
        result({ clientRef: adds[0].clientRef, id: 11, status: 'CREATED' }),
        result({
          clientRef: adds[1].clientRef,
          status: 'REJECTED',
          errorCode: 'SESSION_RECORD_PLAYER_NOT_JOINED',
        }),
      ],
      records: [record(10, 'a'), record(11, 'good')],
    };
    const next = applyResponse(draft, response, o);
    const rows = orderedRows(next, o);
    expect(rows.map((r) => String(r.current.text))).toEqual(['a', 'good', 'bad', '']);
    const rejected = rows[2];
    expect(rejected.rejection?.code).toBe('SESSION_RECORD_PLAYER_NOT_JOINED');
    expect(rejected.number).toBe(3);
    expect(diffDraft(next, o).add.map((op) => op.data.text)).toEqual(['bad']);
  });

  it('lists rows saved first, then new, then rejected, with the placeholder last', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = take(draft, o, 'bad');
    const ref = diffDraft(draft, o).add[0].clientRef;
    draft = applyResponse(
      draft,
      {
        results: [result({ clientRef: ref, status: 'REJECTED', errorCode: 'SESSION_RECORD_INVALID' })],
        records: [record(10, 'a')],
      },
      o,
    );
    draft = take(draft, o, 'fresh');
    expect(orderedRows(draft, o).map((row) => `${row.rejection === null ? 'ok' : 'rejected'}:${String(row.current.text)}`)).toEqual([
      'ok:a',
      'ok:fresh',
      'rejected:bad',
      'ok:',
    ]);
  });

  it('a rejected update stays edited against the fresh saved values; undo clears its message', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = editRow(draft, 'rec-10', { text: 'bad-edit' }, o);
    const response: RecordChangeSetResponse = {
      results: [result({ requestedId: 10, status: 'REJECTED', errorCode: 'SESSION_RECORD_INVALID' })],
      records: [record(10, 'a-by-someone')],
    };
    let next = applyResponse(draft, response, o);
    const row = next.rows.find((r) => r.id === 10)!;
    expect(row.rejection?.code).toBe('SESSION_RECORD_INVALID');
    expect(row.initial).toEqual({ text: 'a-by-someone' });
    expect(row.current).toEqual({ text: 'bad-edit' });
    expect(next.rows.filter((r) => r.id === 10)).toHaveLength(1);
    next = undoRow(next, row.key, o);
    const undone = next.rows.find((r) => r.id === 10)!;
    expect(undone.rejection).toBeNull();
    expect(undone.current).toEqual({ text: 'a-by-someone' });
  });

  it('a rejected update of a record that is gone stays as a new row', () => {
    const o = options();
    let draft = createDraft([record(10, 'a')], o);
    draft = editRow(draft, 'rec-10', { text: 'edit' }, o);
    const response: RecordChangeSetResponse = {
      results: [result({ requestedId: 10, status: 'REJECTED', errorCode: 'SESSION_RECORD_LIMIT_REACHED', errorParams: { maxRecords: 1 } })],
      records: [],
    };
    const next = applyResponse(draft, response, o);
    const rejected = next.rows.find((r) => r.rejection !== null)!;
    expect(rejected.id).toBeNull();
    expect(rejected.rejection?.params).toEqual({ maxRecords: 1 });
    expect(diffDraft(next, o).add.map((op) => op.data.text)).toEqual(['edit']);
  });

  it('skips fresh records the schema rejects', () => {
    const o = options();
    const draft = createDraft([record(10, 'a')], o);
    const next = applyResponse(
      draft,
      { results: [], records: [record(10, 'a'), record(11, 'broken')] },
      o,
      (r) => r.data.text !== 'broken',
    );
    expect(labels(next, o)).toEqual(['#1:a', '#2:']);
  });
});

describe('sameData', () => {
  it('ignores key order and compares arrays by position', () => {
    expect(sameData({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameData({ b: [1, 2] }, { b: [2, 1] })).toBe(false);
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
