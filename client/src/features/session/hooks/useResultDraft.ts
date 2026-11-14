import { useCallback, useMemo, useState } from 'react';
import {
  applyResponse,
  createDraft,
  deleteRow,
  diffDraft,
  editRow,
  isAtLimit,
  operationCount,
  orderedRows,
  undoRow,
  type Draft,
  type DraftOptions,
  type DraftRow,
} from '../resultDraft';
import { MAX_RECORD_OPERATIONS } from '../resultTypes';
import type { RecordChangeSetRequest, RecordChangeSetResponse, RecordData, SessionRecord } from '../resultTypes';

/**
 * CLIENT-GL-38: the record dialog's draft as React state, over the pure functions in `resultDraft.ts`.
 * It starts from the saved records the dialog opened with (mount the dialog body fresh each time it
 * opens, so a reopen starts from the current list); `options` must be stable (memoize it), it is read on
 * every action.
 *
 * `changes` is what Save would send; `canSave` is false while nothing changed or the change set is
 * past the server's 50-operation cap (`tooManyChanges`, for the hint).
 */
export function useResultDraft(records: SessionRecord[], options: DraftOptions) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(records, options));

  const rows: DraftRow[] = useMemo(() => orderedRows(draft, options), [draft, options]);
  const changes: RecordChangeSetRequest = useMemo(() => diffDraft(draft, options), [draft, options]);
  const changeCount = operationCount(changes);

  const edit = useCallback((key: string, data: RecordData) => setDraft((d) => editRow(d, key, data, options)), [options]);
  const remove = useCallback((key: string) => setDraft((d) => deleteRow(d, key, options)), [options]);
  const undo = useCallback((key: string) => setDraft((d) => undoRow(d, key, options)), [options]);
  const applyServerResponse = useCallback(
    (response: RecordChangeSetResponse, isValid?: (record: SessionRecord) => boolean) =>
      setDraft((d) => applyResponse(d, response, options, isValid)),
    [options],
  );

  return {
    draft,
    rows,
    changes,
    changeCount,
    isDirty: changeCount > 0,
    tooManyChanges: changeCount > MAX_RECORD_OPERATIONS,
    canSave: changeCount > 0 && changeCount <= MAX_RECORD_OPERATIONS,
    atLimit: isAtLimit(draft, options),
    edit,
    remove,
    undo,
    applyServerResponse,
  };
}
