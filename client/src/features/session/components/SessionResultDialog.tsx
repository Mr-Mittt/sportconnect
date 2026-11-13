import { IconArrowBackUp, IconX } from '@tabler/icons-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { useApplyRecordChanges } from '../hooks/useApplyRecordChanges';
import { useResultDraft } from '../hooks/useResultDraft';
import { isPlaceholder, rowStatus, type DraftOptions, type DraftRow } from '../resultDraft';
import {
  emptyRecordData,
  playersOf,
  validateRecord,
  winnerFirst,
  type RecordProblem,
} from '../recordData';
import type { RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { problemField } from '../recordFields';
import { teamDisplayOrder, TONE_CLASSES } from '../resultDisplay';
import { showableRecords } from '../showableRecords';
import { RecordEditorCells } from './RecordEditor';

/** Heights of the session detail's title bar (title and status line) and its comment composer, kept clear by the dialog. */
const DETAIL_TITLE_BAR = '4.75rem';
const DETAIL_COMPOSER = '4.25rem';
/** The Winner / Loser labels stay on top while the rows scroll (a solid background so rows do not show through). */
const STICKY_HEAD = 'sticky top-0 z-10 bg-surface-2 pt-1.5 pb-1';

interface SessionResultDialogProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  isOpen: boolean;
  onClose: () => void;
  sessionId: number;
  schema: RecordSchema;
  /** The saved records the dialog opens with; read once per open. */
  records: SessionRecord[];
  /** The session's JOINED participants: who can be picked, in roster order. */
  playerIds: string[];
  names: PlayerNames;
  locale: 'en' | 'vi';
}

/**
 * CLIENT-GL-38: the record dialog. A sibling `Dialog` of the session detail (a nested popup misbehaves
 * there), whose body is mounted fresh on every open so it always starts from the current list.
 */
export function SessionResultDialog(props: SessionResultDialogProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const close = () => {
    setDirty(false);
    setConfirmDiscard(false);
    props.onClose();
  };
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else close();
  };

  return (
    <Dialog
      open={props.isOpen}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      {/* Same box as the session detail underneath (72vh, same anchoring), minus its title bar and its comment composer,
          so both stay in view and the dialog follows the viewport when it is resized. */}
      <DialogContent
        fixedHeight
        fixedHeightVh={72}
        insetTop={DETAIL_TITLE_BAR}
        insetBottom={DETAIL_COMPOSER}
        className="max-w-[35rem]"
        aria-describedby={undefined}
      >
        <DialogTitle className="shrink-0 border-b-hairline border-border px-4 py-2">
          {t('result.dialog.title')}
        </DialogTitle>
        {props.isOpen && (
          <ResultDialogBody
            {...props}
            onClose={close}
            onDirtyChange={setDirty}
            confirmDiscard={confirmDiscard}
            onConfirmDiscardChange={setConfirmDiscard}
            onRequestClose={requestClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ResultDialogBodyProps extends SessionResultDialogProps {
  onDirtyChange: (dirty: boolean) => void;
  confirmDiscard: boolean;
  onConfirmDiscardChange: (open: boolean) => void;
  onRequestClose: () => void;
}

/** One row's problems, from its current data (the placeholder, a deleted row and an untouched saved row have none). */
function rowProblems(row: DraftRow, schema: RecordSchema, options: DraftOptions): RecordProblem[] {
  if (row.deleted || isPlaceholder(row, options) || rowStatus(row) === 'unchanged') return [];
  return validateRecord(schema, row.current);
}

function ResultDialogBody({
  i18nOverridePrefix,
  onClose,
  sessionId,
  schema,
  records,
  playerIds,
  names,
  locale,
  onDirtyChange,
  confirmDiscard,
  onConfirmDiscardChange,
  onRequestClose,
}: ResultDialogBodyProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const { t: tErrors } = useTranslation('errors');
  const mutation = useApplyRecordChanges();

  const options = useMemo<DraftOptions>(
    () => ({ emptyData: () => emptyRecordData(schema), maxRecords: schema.maxRecords, playersOf }),
    [schema],
  );
  const initial = useMemo(() => showableRecords(schema, records), [schema, records]);
  const draft = useResultDraft(initial, options);

  const [touched, setTouched] = useState<Record<string, string[]>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Keep the parent's "has unsaved changes" flag in step (its close confirmation reads it).
  const isDirty = draft.isDirty;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const visibleProblems = (row: DraftRow): RecordProblem[] => {
    const all = rowProblems(row, schema, options);
    if (submitAttempted || row.rejection !== null) return all;
    const seen = touched[row.key] ?? [];
    return all.filter((problem) => seen.includes(problemField(problem)));
  };

  const problemText = (problem: RecordProblem) =>
    t(`result.problem.${problem.code}`, {
      min: schema.playersPerSide.min,
      max: schema.playersPerSide.max,
      // plural form of PLAYERS_MIN ("Select the player." / "Select at least 2 players.")
      count: schema.playersPerSide.min,
    });

  const rejectionText = (row: DraftRow): string | null => {
    if (row.rejection === null) return null;
    return tErrors(`codes.${row.rejection.code}`, {
      ...(row.rejection.params ?? {}),
      defaultValue: tErrors('codes.SESSION_RECORD_INVALID'),
    });
  };

  const save = () => {
    const invalid = draft.rows.some((row) => rowProblems(row, schema, options).length > 0);
    if (invalid) {
      setSubmitAttempted(true);
      return;
    }
    // The winner goes first (a team typed on the wrong side swaps, with its score): the server stores it that way and the
    // list below reloads from the response, so the rows swap here too.
    const changes = {
      ...draft.changes,
      add: draft.changes.add.map((op) => ({ ...op, data: winnerFirst(schema, op.data) })),
      update: draft.changes.update.map((op) => ({ ...op, data: winnerFirst(schema, op.data) })),
    };
    mutation.mutate(
      { sessionId, changes },
      {
        onSuccess: (response) => {
          setSubmitAttempted(false);
          setTouched({});
          draft.applyServerResponse(
            // a record the server holds with the loser first still reads winner first here
            {
              ...response,
              records: response.records.map((record) => ({
                ...record,
                data: winnerFirst(schema, record.data),
              })),
            },
            (record) => showableRecords(schema, [record]).length === 1,
          );
          // The dialog stays open after a save, even when everything succeeded (owner, 2026-11-14).
        },
      },
    );
  };

  const wholeRequestError = mutation.isError
    ? (getCodedErrorMessage(mutation.error) ?? t('result.dialog.saveError'))
    : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-1.5">
        {draft.atLimit && (
          <p className="pt-1.5 text-2xs text-text-secondary">
            {t('result.dialog.limitReached', { max: schema.maxRecords })}
          </p>
        )}
        {/* Six columns: index | team 1 | score 1 - score 2 | team 2 | action. The first row holds the two labels in its 2nd and 5th cells. */}
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          aria-label={t('result.dialog.title')}
        >
          <colgroup>
            <col className="w-6" />
            <col />
            <col className="w-14" />
            <col className="w-14" />
            <col />
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" aria-hidden="true" className={STICKY_HEAD} />
              {teamDisplayOrder(schema).map((team, position) => {
                const won = team === 0;
                const tone = TONE_CLASSES[won ? schema.ui.winnerTone : schema.ui.loserTone];
                return (
                  <Fragment key={team}>
                    {position === 1 && (
                      <>
                        <th scope="col" aria-hidden="true" className={STICKY_HEAD} />
                        <th scope="col" aria-hidden="true" className={STICKY_HEAD} />
                      </>
                    )}
                    <th scope="col" className={cn(STICKY_HEAD, 'px-0.5')}>
                      <span
                        className={cn(
                          'block text-center text-2xs font-semibold underline',
                          tone.label,
                        )}
                      >
                        {won ? t('result.teamWinner') : t('result.teamLoser')}
                      </span>
                    </th>
                  </Fragment>
                );
              })}
              <th scope="col" aria-hidden="true" className={STICKY_HEAD} />
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row) => {
              const status = rowStatus(row);
              const placeholder = isPlaceholder(row, options);
              const rejected = rejectionText(row);
              const shown = visibleProblems(row);
              const messages = [...new Set(shown.map(problemText))];
              return (
                <Fragment key={row.key}>
                  <tr
                    data-row-status={placeholder ? 'placeholder' : status}
                    data-testid={status === 'deleted' ? 'deleted-record' : undefined}
                  >
                    <td className="py-1 text-center align-middle text-2xs font-semibold text-text-muted">
                      {t('result.dialog.rowNumber', { n: row.number })}
                    </td>
                    <RecordEditorCells
                      schema={schema}
                      data={status === 'deleted' ? (row.initial ?? row.current) : row.current}
                      initialData={row.initial}
                      deleted={status === 'deleted'}
                      playerIds={playerIds}
                      names={names}
                      locale={locale}
                      problems={shown}
                      onChange={(data, fields) => {
                        draft.edit(row.key, data);
                        setTouched((current) => ({
                          ...current,
                          [row.key]: [...new Set([...(current[row.key] ?? []), ...fields])],
                        }));
                      }}
                      text={{
                        teamWinner: t('result.teamWinner'),
                        teamLoser: t('result.teamLoser'),
                        addPlayer: t('result.picker.addPlayer'),
                        clearPlayer: t('result.picker.clear'),
                        formerPlayer: t('result.formerPlayer'),
                        slotLabel: (team, n) => t('result.picker.slotLabel', { team, n }),
                        scoreLabel: (team, slot) => t('result.score.label', { team, slot }),
                      }}
                    />
                    <td className="py-1 text-center align-middle">
                      <RowAction
                        row={row}
                        status={status}
                        placeholder={placeholder}
                        onDelete={() => draft.remove(row.key)}
                        onUndo={() => draft.undo(row.key)}
                        deleteLabel={t('result.row.delete', { n: row.number })}
                        undoLabel={t('result.row.undo', { n: row.number })}
                      />
                    </td>
                  </tr>
                  {(messages.length > 0 || rejected !== null) && (
                    <tr data-row-message>
                      <td />
                      <td colSpan={5} className="pb-1 text-center text-2xs text-text-danger">
                        <div role="alert">
                          {messages.map((message) => (
                            <p key={message}>{message}</p>
                          ))}
                          {rejected !== null && <p data-testid="row-rejection">{rejected}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t-hairline border-border bg-surface-2 px-3 py-2.5">
        {draft.tooManyChanges && (
          <p className="text-2xs text-text-danger">
            {t('result.dialog.tooManyChanges', { max: 50 })}
          </p>
        )}
        {wholeRequestError !== null && (
          <p className="text-2xs text-text-danger" role="alert">
            {wholeRequestError}
          </p>
        )}
        {confirmDiscard ? (
          <div
            className="flex flex-col gap-2 rounded-md bg-surface-1 p-2"
            role="alertdialog"
            aria-label={t('result.dialog.discardTitle')}
          >
            <p className="text-2xs font-semibold text-text-primary">
              {t('result.dialog.discardTitle')}
            </p>
            <p className="text-2xs text-text-secondary">{t('result.dialog.discardBody')}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => onConfirmDiscardChange(false)}>
                {t('result.dialog.keepEditing')}
              </Button>
              <Button size="sm" variant="primary" onClick={onClose}>
                {t('result.dialog.discardConfirm')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onRequestClose}>
              {draft.isDirty ? t('result.dialog.discard') : t('result.dialog.close')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!draft.isDirty || draft.tooManyChanges || mutation.isPending}
              onClick={save}
            >
              {mutation.isPending ? t('result.dialog.saving') : t('result.dialog.save')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The right-hand action slot of a row. A saved row starts with the red X (delete); once it is deleted or
 * edited it turns into the blue undo (back to the saved values). A new row has the red X, which removes
 * it completely, and the untouched placeholder has no action.
 */
function RowAction({
  row,
  status,
  placeholder,
  onDelete,
  onUndo,
  deleteLabel,
  undoLabel,
}: {
  row: DraftRow;
  status: ReturnType<typeof rowStatus>;
  placeholder: boolean;
  onDelete: () => void;
  onUndo: () => void;
  deleteLabel: string;
  undoLabel: string;
}) {
  if (placeholder) return null;
  const canUndo =
    row.initial !== null && (status === 'deleted' || status === 'edited' || row.rejection !== null);
  if (canUndo) {
    return (
      <button
        type="button"
        onClick={onUndo}
        aria-label={undoLabel}
        title={undoLabel}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-text-accent hover:bg-bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        <IconArrowBackUp className="size-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label={deleteLabel}
      title={deleteLabel}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full text-text-danger hover:bg-bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
    >
      <IconX className="size-4" aria-hidden="true" />
    </button>
  );
}
