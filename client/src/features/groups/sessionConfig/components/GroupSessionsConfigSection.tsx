import { useState } from 'react';
import { SessionFormSection } from '@/features/session/components/SessionFormSection';
import { EmptyHint } from '@/shared/components/EmptyHint';
import { clockEndTime, clockTime, recurrenceDayLabel } from '@/shared/lib/recurrenceDay';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { ToggleFieldRow } from '../../components/ToggleFieldRow';
import type { GroupSessionsConfigData } from '../useGroupSessionsConfigData';
import type { GroupSessionRecurrence, RecurrenceMissingField, RecurrenceMode } from '../types';
import { ChoiceDialog, type DialogChoice } from './ChoiceDialog';

type Pending =
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'mode'; mode: RecurrenceMode }
  | { kind: 'delete'; recurrence: GroupSessionRecurrence };

interface GroupSessionsConfigSectionProps {
  /** The owner or an admin: they change the switch, the recurrence and the configurations; a member only reads them. */
  canEdit: boolean;
  data: GroupSessionsConfigData;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

const MISSING_KEY: Record<RecurrenceMissingField, string> = {
  locationId: 'noLocation',
  durationMinutes: 'noDuration',
  feeAmountVnd: 'noFee',
};

function byStart(a: GroupSessionRecurrence, b: GroupSessionRecurrence): number {
  return a.startTime.localeCompare(b.startTime) || a.id - b.id;
}

/**
 * CLIENT-GROUP-SESSION-4: the body of the group settings' "Sessions" section. The ON/OFF switch (the tab's On/Off pill) with its confirmations, the
 * recurrence mode with its confirm, an Add button (disabled until the form of CLIENT-GROUP-SESSION-5 exists), and the configurations of the group's
 * current mode grouped by day in collapsed sections, each slot with a disabled Edit and a Delete that confirms. When generation is OFF everything
 * below the switch is hidden. Presentational: `data` carries the queries and the three actions; this owns only which dialog is open and which day
 * groups are expanded.
 */
export function GroupSessionsConfigSection({ canEdit, data, i18nOverridePrefix }: GroupSessionsConfigSectionProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openDays, setOpenDays] = useState<ReadonlySet<number>>(new Set());

  const { settings } = data;
  if (data.isSettingsLoading) return <p className="text-2sm text-text-muted">{t('settings.loading')}</p>;
  if (data.isSettingsError || settings === undefined) {
    return (
      <p role="alert" className="text-2sm text-text-danger">
        {t('settings.sessions.loadError')}
      </p>
    );
  }

  const modeConfigurations = (data.recurrences ?? []).filter((recurrence) => recurrence.mode === settings.mode);
  const days = [...new Set(modeConfigurations.map((recurrence) => recurrence.dayKey))].sort((a, b) => a - b);

  const slotLabel = (recurrence: GroupSessionRecurrence) =>
    t('settings.sessions.slotAt', {
      day: recurrenceDayLabel(recurrence.mode, recurrence.dayKey),
      time: clockTime(recurrence.startTime),
    });

  const requestMode = (mode: RecurrenceMode) => {
    if (mode === settings.mode) return;
    // The confirm is about configurations that would stop being usable; with none there is nothing to warn about.
    if (modeConfigurations.length > 0) setPending({ kind: 'mode', mode });
    else data.onSetMode(mode);
  };

  const close = () => setPending(null);
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  let dialog: { title: string; body: string; choices: DialogChoice[] } | null = null;
  if (pending?.kind === 'on') {
    dialog = {
      title: t('settings.sessions.onDialog.title'),
      body: t('settings.sessions.onDialog.body'),
      choices: [
        { key: 'back', label: t('settings.sessions.onDialog.back'), variant: 'outline', onSelect: close },
        { key: 'confirm', label: t('settings.sessions.onDialog.confirm'), variant: 'primary', onSelect: choose(() => data.onSetEnabled(true)) },
      ],
    };
  } else if (pending?.kind === 'off') {
    dialog = {
      title: t('settings.sessions.offDialog.title'),
      body: t('settings.sessions.offDialog.body'),
      choices: [
        { key: 'hold', label: t('settings.sessions.offDialog.hold'), variant: 'outline', onSelect: close },
        {
          key: 'cancelAndOff',
          label: t('settings.sessions.offDialog.cancelAndOff'),
          variant: 'danger',
          onSelect: choose(() => data.onSetEnabled(false, true)),
        },
        {
          key: 'keepAndOff',
          label: t('settings.sessions.offDialog.keepAndOff'),
          variant: 'primary',
          onSelect: choose(() => data.onSetEnabled(false, false)),
        },
      ],
    };
  } else if (pending?.kind === 'mode') {
    const { mode } = pending;
    dialog = {
      title: t('settings.sessions.modeDialog.title'),
      body: t('settings.sessions.modeDialog.body'),
      choices: [
        { key: 'stay', label: t('settings.sessions.modeDialog.stay'), variant: 'outline', onSelect: close },
        { key: 'confirm', label: t('settings.sessions.modeDialog.confirm'), variant: 'primary', onSelect: choose(() => data.onSetMode(mode)) },
      ],
    };
  } else if (pending?.kind === 'delete') {
    const { recurrence } = pending;
    dialog = {
      title: t('settings.sessions.deleteDialog.title'),
      body: t('settings.sessions.deleteDialog.body', { slot: slotLabel(recurrence) }),
      choices: [
        { key: 'cancel', label: t('settings.sessions.deleteDialog.cancel'), variant: 'outline', onSelect: close },
        { key: 'confirm', label: t('settings.sessions.deleteDialog.confirm'), variant: 'danger', onSelect: choose(() => data.onDelete(recurrence.id)) },
      ],
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleFieldRow
        label={t('settings.sessions.regular')}
        description={t('settings.sessions.regularDesc')}
        value={settings.enabled}
        canEdit={canEdit}
        onChange={(next) => setPending({ kind: next ? 'on' : 'off' })}
        t={t}
      />
      {data.isUpdateError && (
        <p role="alert" className="text-2xs text-text-danger">
          {data.updateErrorText ?? t('settings.sessions.toggleError')}
        </p>
      )}

      {settings.enabled && (
        <>
          <div className="border-hairline-t flex items-end gap-2 border-border pt-3.5">
            <div className="min-w-0 flex-1">
              <Label htmlFor="group-session-recurrence">{t('settings.sessions.recurrence')}</Label>
              {canEdit ? (
                <Select
                  id="group-session-recurrence"
                  value={settings.mode}
                  disabled={data.isBusy}
                  onChange={(event) => requestMode(event.target.value as RecurrenceMode)}
                >
                  <option value="WEEKLY">{t('settings.sessions.weekly')}</option>
                  <option value="MONTHLY">{t('settings.sessions.monthly')}</option>
                </Select>
              ) : (
                <p id="group-session-recurrence" className="text-2sm text-text-secondary">
                  {settings.mode === 'MONTHLY' ? t('settings.sessions.monthly') : t('settings.sessions.weekly')}
                </p>
              )}
            </div>
            {canEdit && (
              // Disabled until CLIENT-GROUP-SESSION-5 builds the configuration form this opens.
              <Button variant="outline" size="sm" disabled>
                {t('settings.sessions.add')}
              </Button>
            )}
          </div>

          {data.isRecurrencesLoading ? (
            <p className="text-2sm text-text-muted">{t('settings.loading')}</p>
          ) : data.isRecurrencesError ? (
            <p role="alert" className="text-2sm text-text-danger">
              {t('settings.sessions.listError')}
            </p>
          ) : days.length === 0 ? (
            <EmptyHint>{t('settings.sessions.empty')}</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2">
              {days.map((dayKey) => {
                const slots = modeConfigurations.filter((recurrence) => recurrence.dayKey === dayKey).sort(byStart);
                return (
                  <SessionFormSection
                    key={dayKey}
                    title={t('settings.sessions.dayTitle', { day: recurrenceDayLabel(settings.mode, dayKey), count: slots.length })}
                    open={openDays.has(dayKey)}
                    onOpenChange={(open) =>
                      setOpenDays((current) => {
                        const next = new Set(current);
                        if (open) next.add(dayKey);
                        else next.delete(dayKey);
                        return next;
                      })
                    }
                    summary={
                      <ul className="flex flex-col gap-0.5">
                        {slots.map((slot) => (
                          <li key={slot.id}>
                            <SlotLine slot={slot} t={t} />
                          </li>
                        ))}
                      </ul>
                    }
                  >
                    <ul className="flex flex-col gap-2">
                      {slots.map((slot) => (
                        <li key={slot.id} className="flex items-start justify-between gap-2">
                          <SlotLine slot={slot} t={t} showAddress />
                          {canEdit && (
                            <div className="flex shrink-0 items-center gap-1">
                              {/* Disabled until CLIENT-GROUP-SESSION-5. */}
                              <Button variant="ghost" size="sm" disabled aria-label={t('settings.sessions.editLabel', { slot: slotLabel(slot) })}>
                                {t('settings.sessions.edit')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={data.isBusy}
                                aria-label={t('settings.sessions.deleteLabel', { slot: slotLabel(slot) })}
                                onClick={() => setPending({ kind: 'delete', recurrence: slot })}
                              >
                                {t('settings.sessions.delete')}
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </SessionFormSection>
                );
              })}
            </div>
          )}
          {data.isDeleteError && (
            <p role="alert" className="text-2xs text-text-danger">
              {data.deleteErrorText ?? t('settings.sessions.deleteError')}
            </p>
          )}
        </>
      )}

      {!canEdit && <p className="text-2xs text-text-muted">{t('settings.ownerAdminOnly')}</p>}

      <ChoiceDialog
        isOpen={dialog !== null}
        title={dialog?.title ?? ''}
        body={dialog?.body ?? ''}
        choices={dialog?.choices ?? []}
        onClose={close}
      />
    </div>
  );
}

/** One configuration as a line: `18:00–19:30 · Court 9`, then what it lacks in amber and a "Draft" chip when it cannot generate yet. */
function SlotLine({
  slot,
  t,
  showAddress = false,
}: {
  slot: GroupSessionRecurrence;
  t: ReturnType<typeof useOverridableText>;
  showAddress?: boolean;
}) {
  const start = clockTime(slot.startTime);
  const end = clockEndTime(slot.startTime, slot.durationMinutes);
  const where =
    slot.location !== null ? slot.location.name : slot.locationId !== null ? t('settings.sessions.locationUnavailable') : null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-text-primary">
      <span className="font-medium">{end !== null ? `${start}–${end}` : start}</span>
      {where !== null && <span>· {where}</span>}
      {showAddress && slot.location?.address != null && <span className="text-text-muted">{slot.location.address}</span>}
      {slot.missing.map((field) => (
        <span key={field} className="text-amber-800 italic">
          {t(`settings.sessions.${MISSING_KEY[field]}`)}
        </span>
      ))}
      {slot.draft && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800">{t('settings.sessions.draft')}</span>
      )}
    </div>
  );
}
