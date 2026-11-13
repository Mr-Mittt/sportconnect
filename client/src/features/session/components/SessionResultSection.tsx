import { IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { showableRecords } from '../showableRecords';
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
  onUpdate: () => void;
}

/**
 * CLIENT-GL-38: the session detail's collapsible Result section (collapsed by default), under Players.
 * It lists the session's saved records, oldest first (#1, #2, ...), each drawn from the sport's record
 * schema (`RecordCard`); the header's Update button opens the record dialog and only shows for a JOINED
 * participant inside the window. A record that fails the schema is skipped, not shown. The scoreboard
 * is CLIENT-GL-49.
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
  onUpdate,
}: SessionResultSectionProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [open, setOpen] = useState(false);
  const shown = records === undefined ? [] : showableRecords(schema, records);
  // Collapsed: the 3 latest records and a line saying it is a short list. Open: every record.
  const latest = shown.slice(-LATEST_RECORDS);
  const firstNumber = shown.length - latest.length + 1;
  const renderCards = (list: typeof shown, startNumber: number) => (
    <div className="flex flex-col gap-1">
      <RecordListHeader
        schema={schema}
        text={{ teamWinner: t('result.teamWinner'), teamLoser: t('result.teamLoser') }}
      />
      <ol className="flex flex-col gap-1.5">
        {list.map((record, index) => (
          <RecordCard
            key={record.id}
            schema={schema}
            data={record.data}
            number={startNumber + index}
            names={names}
            locale={locale}
            text={{ formerPlayer: t('result.formerPlayer') }}
          />
        ))}
      </ol>
    </div>
  );

  return (
    <section aria-label={t('result.label')}>
      <SessionFormSection
        i18nOverridePrefix={i18nOverridePrefix}
        title={t('result.heading', { count: shown.length })}
        open={open}
        onOpenChange={setOpen}
        scrollIntoViewOnOpen
        // Collapsed (owner, 2026-11-13): an empty section says so, a section with records shows the 3 latest and a line
        // saying it is a short list; opening it shows them all.
        summary={
          isLoading || isError ? undefined : shown.length === 0 ? (
            <EmptyHint size="2xs">{t('result.empty')}</EmptyHint>
          ) : (
            <div className="flex flex-col gap-1">
              {renderCards(latest, firstNumber)}
              {shown.length > latest.length && (
                <EmptyHint size="2xs" className="italic">
                  {t('result.latestHint', { count: latest.length, total: shown.length })}
                </EmptyHint>
              )}
            </div>
          )
        }
        actions={
          canEdit ? (
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
          ) : undefined
        }
      >
        {windowClosed && <p className="text-2xs text-text-secondary">{t('result.windowClosed')}</p>}
        {isLoading && <p className="text-2xs text-text-muted">{t('common.loading')}</p>}
        {isError && <p className="text-2xs text-text-danger">{t('result.loadError')}</p>}
        {!isLoading && !isError && shown.length === 0 && (
          <EmptyHint size="2xs">{t('result.empty')}</EmptyHint>
        )}
        {shown.length > 0 && renderCards(shown, 1)}
      </SessionFormSection>
    </section>
  );
}
