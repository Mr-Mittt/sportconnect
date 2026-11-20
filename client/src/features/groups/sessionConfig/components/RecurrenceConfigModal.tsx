import { useState } from 'react';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import { GroupAudienceField } from '@/features/session/components/GroupAudienceField';
import { GameMoodSlider } from '@/features/session/components/GameMoodSlider';
import { SectionSummary, SessionFormSection, type SectionSummaryItem } from '@/features/session/components/SessionFormSection';
import { CostFields, WhereFields } from '@/features/session/components/SessionSectionFields';
import { buildAttributeSummary } from '@/features/session/sessionAttributeSummary';
import { focusFieldById } from '@/features/session/sessionFormFocus';
import { hasEditedAttributeValues } from '@/shared/components/attributeFields/defaults';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { formatGameMood } from '@/shared/lib/gameMood';
import { clockTime, recurrenceDayLabel } from '@/shared/lib/recurrenceDay';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import {
  emptyRecurrenceValues,
  missingForRecurrence,
  valuesFromRecurrence,
  type RecurrenceFormValues,
} from '../recurrenceForm';
import type { RecurrenceFormData } from '../useRecurrenceFormData';
import { useRecurrenceTimeFields } from '../useRecurrenceTimeFields';
import type { RecurrenceMissingField, RecurrenceMode } from '../types';
import { ChoiceDialog } from './ChoiceDialog';
import { RecurrenceWhenFields } from './RecurrenceWhenFields';

type SectionKey = 'when' | 'where' | 'who' | 'cost' | 'detail';
const ALL_OPEN: Record<SectionKey, boolean> = { when: true, where: true, who: true, cost: true, detail: true };

const MISSING_KEY: Record<RecurrenceMissingField, string> = {
  locationId: 'location',
  durationMinutes: 'duration',
  feeAmountVnd: 'feeAmount',
};

interface RecurrenceConfigModalProps {
  form: RecurrenceFormData;
  /** The group's recurrence now: the days offered are weekdays (Weekly) or days of the month (Monthly). */
  mode: RecurrenceMode;
  groupName: string;
  /** Whether regular-session generation is ON: the saved dialog says what happens next accordingly. */
  isGenerationOn: boolean;
  i18nOverridePrefix?: string;
}

/**
 * CLIENT-GROUP-SESSION-5: the form that adds or edits one recurrence configuration of a group (owner or admin). Sections like the session form:
 * **When** (the day, the start, the duration and the end, no date), **Where**, **Who** (all members or specific ones, the game mood), **Cost** and the
 * sport's **Session detail**. Saving needs only a day and a start (always set); with a location, a duration or a fixed fee's amount missing a warning
 * offers Keep editing or Save as draft. A successful save gives way to a dialog (its text depends on the generation switch) with No (closes) and
 * Create more (the form starts over). Presentational: `form` carries the data boundary.
 */
export function RecurrenceConfigModal({ form, mode, groupName, isGenerationOn, i18nOverridePrefix }: RecurrenceConfigModalProps) {
  const tg = useOverridableText('groups', i18nOverridePrefix);
  // A draft never generates a session, whatever the switch says; a complete configuration says what happens next.
  const savedBodyKey = form.isSavedDraft
    ? 'settings.sessions.form.saved.bodyDraft'
    : isGenerationOn
      ? 'settings.sessions.form.saved.bodyOn'
      : 'settings.sessions.form.saved.bodyOff';
  return (
    <>
      {/* The form is remounted by `formKey` on every open and on "Create more", so its own fields start over. */}
      {form.isOpen && !form.isSaved && (
        <RecurrenceForm key={form.formKey} form={form} mode={mode} groupName={groupName} i18nOverridePrefix={i18nOverridePrefix} />
      )}
      <LocationPicker {...form.locationPicker} />
      <ChoiceDialog
        isOpen={form.isOpen && form.isSaved}
        title={tg('settings.sessions.form.saved.title')}
        body={tg(savedBodyKey)}
        choices={[
          { key: 'no', label: tg('settings.sessions.form.saved.no'), variant: 'outline', onSelect: form.close },
          { key: 'more', label: tg('settings.sessions.form.saved.more'), variant: 'primary', onSelect: form.onCreateMore },
        ]}
        onClose={form.close}
      />
    </>
  );
}

function RecurrenceForm({
  form,
  mode,
  groupName,
  i18nOverridePrefix,
}: {
  form: RecurrenceFormData;
  mode: RecurrenceMode;
  groupName: string;
  i18nOverridePrefix?: string;
}) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const tg = useOverridableText('groups', i18nOverridePrefix);

  const [initial] = useState<RecurrenceFormValues>(() =>
    form.editing !== null ? valuesFromRecurrence(form.editing) : emptyRecurrenceValues(),
  );
  const [initialLocationId] = useState(form.selectedLocation?.id ?? null);
  const [dayKey, setDayKey] = useState(initial.dayKey);
  const time = useRecurrenceTimeFields({ start: initial.start, duration: initial.duration });
  const [locationNote, setLocationNote] = useState(initial.locationNote);
  const [audience, setAudience] = useState(initial.audience);
  const [audienceMembers, setAudienceMembers] = useState(initial.audienceMembers);
  const [feeType, setFeeType] = useState(initial.feeType);
  const [feeAmountVnd, setFeeAmountVnd] = useState(initial.feeAmountVnd);
  const [feeNote, setFeeNote] = useState(initial.feeNote);
  const [gameMood, setGameMood] = useState(initial.gameMood);
  const [openSections, setOpenSections] = useState(ALL_OPEN);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isMissingOpen, setIsMissingOpen] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const values: RecurrenceFormValues = {
    dayKey,
    start: time.start,
    duration: time.duration,
    locationNote,
    audience,
    audienceMembers,
    feeType,
    feeAmountVnd,
    feeNote,
    gameMood,
  };
  const missing = missingForRecurrence({ location: form.selectedLocation, duration: time.duration, feeType, feeAmountVnd });
  const isDirty =
    dayKey !== initial.dayKey ||
    time.start !== initial.start ||
    time.duration !== initial.duration ||
    locationNote !== initial.locationNote ||
    audience !== initial.audience ||
    audienceMembers.map((member) => member.id).join() !== initial.audienceMembers.map((member) => member.id).join() ||
    feeType !== initial.feeType ||
    feeAmountVnd !== initial.feeAmountVnd ||
    feeNote !== initial.feeNote ||
    gameMood !== initial.gameMood ||
    (form.selectedLocation?.id ?? null) !== initialLocationId ||
    hasEditedAttributeValues(form.sessionAttributeSchema, form.sessionAttributeValues);

  const requestClose = () => {
    if (isDirty) setIsLeaveOpen(true);
    else form.close();
  };

  const requestSave = () => {
    const needsMembers = audience === 'SPECIFIC' && audienceMembers.length === 0;
    if (time.start === '' || time.isEndInvalid || needsMembers) {
      setHasAttemptedSubmit(true);
      setOpenSections(ALL_OPEN);
      if (needsMembers) setTimeout(() => focusFieldById('recurrence-audience-search'), 0);
      return;
    }
    if (missing.length > 0) setIsMissingOpen(true);
    else form.save(values);
  };

  const setSection = (key: SectionKey, open: boolean) => setOpenSections((current) => ({ ...current, [key]: open }));

  const summaries: Record<SectionKey, SectionSummaryItem[]> = {
    when: [
      { label: tg('settings.sessions.form.day'), value: recurrenceDayLabel(mode, dayKey) },
      { label: t('detail.summary.starts'), value: time.start !== '' ? clockTime(time.start) : null },
      { label: t('detail.summary.duration'), value: time.duration !== '' ? t('detail.summary.minutes', { count: Number(time.duration) }) : null },
      { label: t('detail.summary.ends'), value: time.end !== '' ? time.end : null },
    ],
    where: [
      { label: t('detail.summary.location'), value: form.selectedLocation?.name },
      { label: t('detail.summary.note'), value: locationNote.trim() },
    ],
    who: [
      {
        label: t('detail.summary.audience'),
        value:
          audience === 'SPECIFIC'
            ? t('detail.summary.audienceSpecific', { count: audienceMembers.length })
            : t('detail.summary.audienceAll'),
      },
      { label: t('detail.summary.mood'), value: formatGameMood(gameMood) },
    ],
    cost: [
      {
        label: t('detail.summary.fee'),
        value: feeType === undefined ? null : formatFeeDisplay(feeType, feeType === 'FIXED' && feeAmountVnd !== '' ? Number(feeAmountVnd) : null),
      },
      { label: t('detail.summary.feeNote'), value: feeNote.trim() },
    ],
    detail:
      form.sessionAttributeSchema !== null
        ? buildAttributeSummary(form.sessionAttributeSchema, form.sessionAttributeValues).map((entry) => ({ label: entry.label, value: entry.text }))
        : [],
  };

  const missingItems = missing.map((field) => tg(`settings.sessions.form.missing.${MISSING_KEY[field]}`));

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent fixedHeight fixedHeightVh={70} className="max-w-2xl">
          <DialogHeader
            title={form.editing !== null ? tg('settings.sessions.form.titleEdit') : tg('settings.sessions.form.titleAdd')}
            className="border-hairline-b border-border px-4 py-3"
          />
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3.5">
            <p className="mb-1 text-2xs text-text-muted">{tg('settings.sessions.form.intro', { group: groupName })}</p>

            <SessionFormSection
              title={t('form.sections.when')}
              open={openSections.when}
              onOpenChange={(open) => setSection('when', open)}
              summary={<SectionSummary items={summaries.when} />}
              missing={missing.includes('durationMinutes') ? ['duration'] : []}
            >
              <RecurrenceWhenFields mode={mode} dayKey={dayKey} onDayChange={setDayKey} time={time} idPrefix="recurrence" i18nOverridePrefix={i18nOverridePrefix} />
            </SessionFormSection>

            <SessionFormSection
              title={t('form.sections.where')}
              open={openSections.where}
              onOpenChange={(open) => setSection('where', open)}
              summary={<SectionSummary items={summaries.where} />}
              missing={missing.includes('locationId') ? ['location'] : []}
            >
              <WhereFields
                idPrefix="recurrence"
                i18nOverridePrefix={i18nOverridePrefix}
                location={form.selectedLocation}
                favorites={form.favoriteLocations}
                isFavoritesLoading={form.isFavoriteLocationsLoading}
                onSelectFavorite={form.onSelectLocation}
                onOpenPicker={form.onOpenLocationPicker}
                note={locationNote}
                onNoteChange={setLocationNote}
              />
            </SessionFormSection>

            <SessionFormSection
              title={t('form.sections.who')}
              open={openSections.who}
              onOpenChange={(open) => setSection('who', open)}
              summary={<SectionSummary items={summaries.who} />}
            >
              <div className="flex flex-col gap-3.5">
                <GroupAudienceField
                  i18nOverridePrefix={i18nOverridePrefix}
                  idPrefix="recurrence-audience"
                  audience={audience}
                  onAudienceChange={setAudience}
                  selected={audienceMembers}
                  results={form.audienceSearch.results.filter((member) => !audienceMembers.some((picked) => picked.id === member.id))}
                  query={form.audienceSearch.query}
                  onQueryChange={form.audienceSearch.onQueryChange}
                  isSearching={form.audienceSearch.isSearching}
                  isSearchError={form.audienceSearch.isSearchError}
                  onSelect={(member) => setAudienceMembers((prev) => [...prev, member])}
                  onRemove={(memberId) => setAudienceMembers((prev) => prev.filter((member) => member.id !== memberId))}
                  showPickError={hasAttemptedSubmit}
                />
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">{t('create.mood.label')}</span>
                  <GameMoodSlider i18nOverridePrefix={i18nOverridePrefix} id="recurrence-mood" value={gameMood} onChange={setGameMood} />
                </div>
              </div>
            </SessionFormSection>

            <SessionFormSection
              title={t('form.sections.cost')}
              open={openSections.cost}
              onOpenChange={(open) => setSection('cost', open)}
              summary={<SectionSummary items={summaries.cost} />}
            >
              <CostFields
                idPrefix="recurrence"
                i18nOverridePrefix={i18nOverridePrefix}
                feeType={feeType}
                onFeeTypeChange={setFeeType}
                feeAmount={feeAmountVnd}
                onFeeAmountChange={setFeeAmountVnd}
                feeNote={feeNote}
                onFeeNoteChange={setFeeNote}
              />
            </SessionFormSection>

            {form.sessionAttributeSchema !== null && (
              <SessionFormSection
                title={t('create.detail')}
                open={openSections.detail}
                onOpenChange={(open) => setSection('detail', open)}
                summary={<SectionSummary items={summaries.detail} />}
              >
                <SportAttributesFields
                  schema={form.sessionAttributeSchema}
                  values={form.sessionAttributeValues}
                  onChange={form.onSessionAttributeChange}
                  refChoiceSource={form.refChoiceSource}
                  refDraftOptions={form.refDraftOptions}
                  onAddRefDraftOption={form.onAddRefDraftOption}
                  refBaseSchema={form.refBaseSchema}
                />
              </SessionFormSection>
            )}

            {form.isSaveError && (
              <p role="alert" className="text-2sm text-text-danger">
                {form.saveErrorText ?? tg('settings.sessions.form.saveError')}
              </p>
            )}
          </div>
          <div className="border-hairline-t flex justify-end border-border px-4 py-3">
            <Button
              variant="primary"
              onClick={requestSave}
              disabled={form.isSaving}
              className={cn('shrink-0 cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
            >
              {form.isSaving ? tg('settings.sessions.form.saving') : tg('settings.sessions.form.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ChoiceDialog
        isOpen={isMissingOpen}
        title={tg('settings.sessions.form.missing.title')}
        body={tg('settings.sessions.form.missing.body')}
        items={missingItems}
        choices={[
          { key: 'keep', label: tg('settings.sessions.form.missing.keepEditing'), variant: 'outline', onSelect: () => setIsMissingOpen(false) },
          {
            key: 'draft',
            label: tg('settings.sessions.form.missing.saveDraft'),
            variant: 'primary',
            onSelect: () => {
              setIsMissingOpen(false);
              form.save(values);
            },
          },
        ]}
        onClose={() => setIsMissingOpen(false)}
      />
      <ChoiceDialog
        isOpen={isLeaveOpen}
        title={tg('settings.sessions.form.leaveDialog.title')}
        body={tg('settings.sessions.form.leaveDialog.body')}
        choices={[
          { key: 'stay', label: tg('settings.sessions.form.leaveDialog.stay'), variant: 'outline', onSelect: () => setIsLeaveOpen(false) },
          { key: 'leave', label: tg('settings.sessions.form.leaveDialog.leave'), variant: 'danger', onSelect: form.close },
        ]}
        onClose={() => setIsLeaveOpen(false)}
      />
    </>
  );
}
