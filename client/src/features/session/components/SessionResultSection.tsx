import { IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { readTeams } from '../recordData';
import { buildScoreboard } from '../scoreboard';
import { showableRecords } from '../showableRecords';
import { CopyRecordIdButton } from './CopyRecordIdButton';
import { ResultScoreboard } from './ResultScoreboard';
import { RecordCard, RecordListHeader } from './RecordCard';
import { SessionFormSection } from './SessionFormSection';
import { EmptyHint } from '@/shared/components/EmptyHint';

/** How many of the latest records the section lists. */
const LATEST_RECORDS = 3;

interface SessionResultSectionProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  schema: RecordSchema;
  /** `undefined` while loading. */
  records: SessionRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
  names: PlayerNames;
  locale: 'en' | 'vi';
  /** A JOINED participant inside the 24-hour window: the Update button shows. */
  canEdit: boolean;
  /** The 24 hours after `scheduledEndAt` have passed: a line explains why nothing can change. */
  windowClosed: boolean;
  /** The caller, for the "my results" switch and the highlighted scoreboard row. */
  currentUserId?: string;
  /** The JOINED participants: every one of them gets a scoreboard row. */
  playerIds: string[];
  onUpdate: () => void;
}

/**
 * CLIENT-GL-38: the session detail's collapsible Result section (collapsed by default), under Players.
 * It lists the session's saved records, oldest first (#1, #2, ...), each drawn from the sport's record
 * schema (`RecordCard`); the header's Update button opens the record dialog and only shows for a JOINED
 * participant inside the window. A record that fails the schema is skipped, not shown. CLIENT-GL-49: below the
 * list, the collapsible scoreboard (`ResultScoreboard`, open by default) of the whole session, built from the sport's `record.scoreboard`; the
 * "my results" switch narrows the list only, never the scoreboard.
 */
export function SessionResultSection({
  i18nOverridePrefix,
  schema,
  records,
  isLoading,
  isError,
  names,
  locale,
  canEdit,
  windowClosed,
  currentUserId,
  playerIds,
  onUpdate,
}: SessionResultSectionProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [open, setOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  /** The scoreboard is open until the user folds it; the state lives here so it survives opening and closing the section. */
  const [scoreboardOpen, setScoreboardOpen] = useState(true);
  const saved = records === undefined ? [] : showableRecords(schema, records);
  // CLIENT-GL-39: the "my results" switch narrows the list (and the 3-latest preview) to the games the caller plays in;
  // the heading reads `Results (mine/all)` while it is on, and the number of all games otherwise.
  const shown =
    mineOnly && currentUserId !== undefined
      ? saved.filter((record) =>
          readTeams(record.data, schema)?.teams.some((team) =>
            team.players.includes(currentUserId),
          ),
        )
      : saved;
  // Collapsed: the 3 latest records and a line saying it is a short list. Open: every record.
  const latest = shown.slice(-LATEST_RECORDS);
  const emptyText = mineOnly && saved.length > 0 ? t('result.myRecordsEmpty') : t('result.empty');
  const scoreboard =
    schema.scoreboard.enabled && saved.length > 0 ? (
      <ResultScoreboard
        i18nOverridePrefix={i18nOverridePrefix}
        schema={schema}
        locale={locale}
        currentUserId={currentUserId}
        open={scoreboardOpen}
        onOpenChange={setScoreboardOpen}
        rows={buildScoreboard({
          schema,
          records: saved,
          joinedIds: playerIds,
          names,
          formerPlayerLabel: t('result.formerPlayer'),
        })}
      />
    ) : null;
  const renderCards = (list: typeof shown) => (
    <div className="flex flex-col gap-1">
      <RecordListHeader
        schema={schema}
        withAction={canEdit}
        text={{ teamWinner: t('result.teamWinner'), teamLoser: t('result.teamLoser') }}
      />
      <ol className="flex flex-col gap-1.5">
        {list.map((record) => (
          <RecordCard
            key={record.id}
            schema={schema}
            data={record.data}
            names={names}
            locale={locale}
            text={{ formerPlayer: t('result.formerPlayer') }}
            action={
              canEdit ? (
                <CopyRecordIdButton recordId={record.id} label={t('result.copyId')} />
              ) : undefined
            }
          />
        ))}
      </ol>
    </div>
  );

  return (
    <section aria-label={t('result.label')}>
      <SessionFormSection
        i18nOverridePrefix={i18nOverridePrefix}
        title={
          mineOnly && currentUserId !== undefined
            ? t('result.headingMine', { mine: shown.length, count: saved.length })
            : t('result.heading', { count: saved.length })
        }
        open={open}
        onOpenChange={setOpen}
        scrollIntoViewOnOpen
        // Collapsed (owner, 2026-11-13): an empty section says so, a section with records shows the 3 latest and a line
        // saying it is a short list; opening it shows them all.
        summary={
          isLoading || isError ? undefined : shown.length === 0 && scoreboard === null ? (
            <EmptyHint size="2xs">{emptyText}</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.length === 0 ? (
                <EmptyHint size="2xs">{emptyText}</EmptyHint>
              ) : (
                <div className="flex flex-col gap-1">
                  {renderCards(latest)}
                  {shown.length > latest.length && (
                    <EmptyHint size="2xs" className="italic">
                      {t('result.latestHint', { count: latest.length, total: shown.length })}
                    </EmptyHint>
                  )}
                </div>
              )}
              {scoreboard}
            </div>
          )
        }
        actions={
          <>
            <span title={t('result.myRecords')} className="mr-1 flex items-center">
              <Switch
                checked={mineOnly}
                onCheckedChange={setMineOnly}
                aria-label={t('result.myRecords')}
              />
            </span>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 rounded-full px-2 sm:px-3"
                aria-label={t('result.update')}
                title={t('result.update')}
                onClick={onUpdate}
              >
                <IconPencil className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t('result.update')}</span>
              </Button>
            )}
          </>
        }
      >
        {windowClosed && <p className="text-2xs text-text-secondary">{t('result.windowClosed')}</p>}
        {isLoading && <p className="text-2xs text-text-muted">{t('common.loading')}</p>}
        {isError && <p className="text-2xs text-text-danger">{t('result.loadError')}</p>}
        {!isLoading && !isError && shown.length === 0 && (
          <EmptyHint size="2xs">{emptyText}</EmptyHint>
        )}
        {shown.length > 0 && renderCards(shown)}
        {!isLoading && !isError && scoreboard}
      </SessionFormSection>
    </section>
  );
}
