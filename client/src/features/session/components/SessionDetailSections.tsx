import { differenceInMinutes, format } from 'date-fns';
import { useState, type ReactNode } from 'react';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { directionsUrl } from '@/shared/lib/mapsLinks';
import { toOffsetAwareIso } from '@/shared/lib/scheduledStart';
import { formatSessionHeaderDateTime, formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { Location } from '@/shared/types/location';
import type { FeeType, Session } from '@/shared/types/session';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { collectSchemaPaths, pickPaths } from '../sessionAttributePaths';
import { buildAttributeSummary } from '../sessionAttributeSummary';
import { useSessionTimeFields } from '../sessionFormTime';
import { formatGameMood, GAME_MOOD_BADGE_CLASSES, getGameMoodLevel } from '@/shared/lib/gameMood';
import { missingForSession, type MissingField } from '../sessionReadiness';
import { genderSplitText, openSlotsOf } from '@/shared/lib/sessionSlots';
import type { UpdateSessionPayload } from '../types';
import { useSessionWhoFields } from '../useSessionWhoFields';
import { AutoApproveConfirmDialog } from './SessionConfirmDialogs';
import { SessionAttributesSummary } from './SessionAttributesSummary';
import {
  SectionEditActions,
  SectionSummary,
  SessionFormSection,
  type SectionSummaryItem,
} from './SessionFormSection';
import { CostFields, OverviewFields, WhenFields, WhereFields, WhoFields } from './SessionSectionFields';

/** The favourites data the Where editor's `LocationFavoritesDropdown` needs, bundled into one prop so the
 * six hosts of `SessionDetailModal` thread a single value through. Owned by `useSessionDetailModalData`
 * (it already runs the favourites query for the picker's hearts). (Moved here from the removed
 * `SessionPreparingCompletion`, CLIENT-SESSION-34.) */
export interface CompletionFavorites {
  locations: Location[];
  isLoading: boolean;
  /** Picking a favourite straight from the dropdown — bypasses the full `LocationPicker`. */
  onSelect: (location: Location) => void;
}

type SectionKey = 'overview' | 'when' | 'where' | 'who' | 'cost' | 'detail';

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function ViewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-2sm text-text-primary">
      <span className="w-24 shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

interface SectionProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The host of a PREPARING session. */
  canEdit: boolean;
  isEditing: boolean;
  /** Another section is being edited. */
  editDisabled: boolean;
  missing: MissingField[];
  onEdit: () => void;
  onDiscard: () => void;
  onSave: (payload: UpdateSessionPayload) => void;
  isSaving: boolean;
  /** Inline failure line of the last save, shown inside the section being edited. */
  saveError: string | null;
}

/** The pieces every section edits through: header actions + the inline save error. */
function useSectionFrame(props: SectionProps, canSave: boolean, onSaveClick: () => void) {
  const actions = (
    <SectionEditActions
      i18nOverridePrefix={props.i18nOverridePrefix}
      mode={props.isEditing ? 'edit' : 'view'}
      canEdit={props.canEdit}
      editDisabled={props.editDisabled}
      isSaving={props.isSaving}
      canSave={canSave}
      onEdit={props.onEdit}
      onSave={onSaveClick}
      onDiscard={props.onDiscard}
    />
  );
  const errorLine =
    props.isEditing && props.saveError !== null ? (
      <p role="alert" className="text-2xs text-text-danger">
        {props.saveError}
      </p>
    ) : null;
  return { actions, errorLine };
}

/* ------------------------------------------------------------------ Overview */

function OverviewSection(props: SectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session } = props;
  const [title, setTitle] = useState(session.title ?? '');
  // SESSION-49: the title is required; a blank one cannot be saved (the server refuses it with SESSION_TITLE_REQUIRED).
  const isBlank = title.trim() === '';
  const changed = !isBlank && title.trim() !== (session.title ?? '');
  const save = () => props.onSave({ title: title.trim() });
  const { actions, errorLine } = useSectionFrame(props, changed, save);
  return (
    <SessionFormSection
      i18nOverridePrefix={props.i18nOverridePrefix}
      title={t('form.sections.overview')}
      open={props.open}
      onOpenChange={props.onOpenChange}
      isEditing={props.isEditing}
      actions={actions}
      scrollIntoViewOnOpen
      scrollIntoViewOnMount
      summary={
        <SectionSummary
          items={[
            { label: t('detail.summary.sport'), value: session.sportName },
            { label: t('detail.summary.title'), value: session.title },
          ]}
        />
      }
    >
      {props.isEditing ? (
        <>
          <OverviewFields
            idPrefix="detail-overview"
            i18nOverridePrefix={props.i18nOverridePrefix}
            title={title}
            onTitleChange={setTitle}
            showTitleError={isBlank}
          />
          {errorLine}
        </>
      ) : (
        <>
          <ViewRow label={t('detail.summary.sport')}>{session.sportName}</ViewRow>
          <ViewRow label={t('detail.summary.title')}>{session.title ?? '...'}</ViewRow>
        </>
      )}
    </SessionFormSection>
  );
}

/* ---------------------------------------------------------------------- When */

function sessionDuration(session: Session): string {
  if (session.scheduledEndAt === null) return '';
  const minutes = differenceInMinutes(new Date(session.scheduledEndAt), new Date(session.scheduledStart));
  return minutes > 0 ? String(minutes) : '';
}

function WhenSection(props: SectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session } = props;
  const initialStart = format(new Date(session.scheduledStart), LOCAL_FORMAT);
  const initialDuration = sessionDuration(session);
  const time = useSessionTimeFields({ start: initialStart, duration: initialDuration });
  const startChanged = time.start !== initialStart;
  const durationChanged = time.duration !== initialDuration && time.duration !== '';
  const canSave = (startChanged || durationChanged) && time.start !== '' && !time.isEndInvalid && !time.isStartInPast;
  const save = () => {
    const payload: UpdateSessionPayload = {};
    if (startChanged) payload.scheduledStart = toOffsetAwareIso(time.start);
    // A start-only edit lets the server shift the end by the same delta; a new duration is sent as is.
    if (durationChanged) payload.durationMinutes = Number(time.duration);
    props.onSave(payload);
  };
  const { actions, errorLine } = useSectionFrame(props, canSave, save);
  const duration = sessionDuration(session);
  return (
    <SessionFormSection
      i18nOverridePrefix={props.i18nOverridePrefix}
      title={t('form.sections.when')}
      open={props.open}
      onOpenChange={props.onOpenChange}
      isEditing={props.isEditing}
      missing={props.missing.filter((field) => field === 'duration')}
      actions={actions}
      scrollIntoViewOnOpen
      scrollIntoViewOnMount
      summary={
        <SectionSummary
          items={[
            { label: t('detail.summary.starts'), value: formatStartTime(session.scheduledStart) },
            { label: t('detail.summary.duration'), value: duration === '' ? null : t('detail.summary.minutes', { count: Number(duration) }) },
            { label: t('detail.summary.ends'), value: session.scheduledEndAt === null ? null : formatStartTime(session.scheduledEndAt) },
          ]}
        />
      }
    >
      {props.isEditing ? (
        <>
          <WhenFields idPrefix="detail-when" i18nOverridePrefix={props.i18nOverridePrefix} time={time} startRequired={false} />
          {errorLine}
        </>
      ) : (
        <>
          <ViewRow label={t('detail.summary.starts')}>
            {formatSessionHeaderDateTime(session.scheduledStart, null)}
          </ViewRow>
          <ViewRow label={t('detail.summary.duration')}>
            {duration === '' ? '...' : t('detail.summary.minutes', { count: Number(duration) })}
          </ViewRow>
          <ViewRow label={t('detail.summary.ends')}>
            {session.scheduledEndAt === null ? '...' : formatStartTime(session.scheduledEndAt)}
          </ViewRow>
        </>
      )}
    </SessionFormSection>
  );
}

/* --------------------------------------------------------------------- Where */

interface WhereSectionProps extends SectionProps {
  /** The location picked in the edit form (page-owned: the picker reports it there). */
  selectedLocation: Location | null;
  onOpenLocationPicker: () => void;
  favorites: CompletionFavorites;
}

function WhereSection(props: WhereSectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session, selectedLocation } = props;
  const [note, setNote] = useState(session.locationNote ?? '');
  const noteChanged = note.trim() !== (session.locationNote ?? '');
  const canSave = selectedLocation !== null || noteChanged;
  const save = () => {
    const payload: UpdateSessionPayload = {};
    if (selectedLocation !== null) payload.locationId = selectedLocation.id;
    if (noteChanged) payload.locationNote = note.trim();
    props.onSave(payload);
  };
  const { actions, errorLine } = useSectionFrame(props, canSave, save);
  const location = session.location;
  return (
    <SessionFormSection
      i18nOverridePrefix={props.i18nOverridePrefix}
      title={t('form.sections.where')}
      open={props.open}
      onOpenChange={props.onOpenChange}
      isEditing={props.isEditing}
      missing={props.missing.filter((field) => field === 'location')}
      actions={actions}
      scrollIntoViewOnOpen
      scrollIntoViewOnMount
      summary={
        <SectionSummary
          items={[
            { label: t('detail.summary.location'), value: location?.name },
            { label: t('detail.summary.note'), value: session.locationNote },
          ]}
        />
      }
    >
      {props.isEditing ? (
        <>
          <WhereFields
            idPrefix="detail-where"
            i18nOverridePrefix={props.i18nOverridePrefix}
            location={selectedLocation ?? location}
            favorites={props.favorites.locations}
            isFavoritesLoading={props.favorites.isLoading}
            onSelectFavorite={props.favorites.onSelect}
            onOpenPicker={props.onOpenLocationPicker}
            note={note}
            onNoteChange={setNote}
          />
          {errorLine}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2sm text-text-primary">
            {/* SESSION-24: null on a PREPARING session created without a location. */}
            <span>{location?.name ?? t('card.locationPending')}</span>
            {location !== null && location.latitude !== null && location.longitude !== null && (
              <a
                href={directionsUrl(location.latitude, location.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2sm font-medium text-text-accent hover:underline"
              >
                {t('detail.getDirections')}
              </a>
            )}
          </div>
          {location?.address !== null && location?.address !== undefined && (
            <div className="text-2xs text-text-muted">{location.address}</div>
          )}
          {session.locationNote !== null && <div className="text-2xs text-text-muted">{session.locationNote}</div>}
        </div>
      )}
    </SessionFormSection>
  );
}

/* ----------------------------------------------------------------------- Who */

function whoSummaryOpen(session: Session, t: (key: string) => string): string {
  const open = openSlotsOf(session);
  const split = genderSplitText(session.maleSlots, session.femaleSlots, {
    male: t('detail.summary.male'),
    female: t('detail.summary.female'),
  });
  return `${open} (${split === '' ? t('detail.summary.anyone') : split})`;
}

function MoodBadge({ mood }: { mood: number }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-2xs font-semibold text-white',
        GAME_MOOD_BADGE_CLASSES[getGameMoodLevel(mood)],
      )}
    >
      {formatGameMood(mood)}
    </span>
  );
}

function WhoSection(props: SectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session } = props;
  const who = useSessionWhoFields({
    taken: String(session.initialSlot + 1),
    open: String(openSlotsOf(session)),
    maleSlots: session.maleSlots,
    femaleSlots: session.femaleSlots,
    gameMood: session.gameMood,
    autoApprove: session.autoApprove,
  });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const canSave = who.open !== '' && who.effectiveTaken >= 1 && !who.genderOverOpen;
  const save = () => props.onSave(who.toUpdatePayload());
  const { actions, errorLine } = useSectionFrame(props, canSave, save);
  const yes = t('detail.summary.yes');
  const no = t('detail.summary.no');
  const summary: SectionSummaryItem[] = [
    { label: t('detail.summary.taken'), value: String(session.initialSlot + 1) },
    { label: t('detail.summary.open'), value: whoSummaryOpen(session, t) },
    { label: t('detail.summary.mood'), value: formatGameMood(session.gameMood) },
    { label: t('detail.summary.autoApprove'), value: session.autoApprove ? yes : no },
  ];
  return (
    <>
      <SessionFormSection
        i18nOverridePrefix={props.i18nOverridePrefix}
        title={t('form.sections.who')}
        open={props.open}
        onOpenChange={props.onOpenChange}
        isEditing={props.isEditing}
        actions={actions}
        scrollIntoViewOnOpen
      scrollIntoViewOnMount
        summary={<SectionSummary items={summary} />}
      >
        {props.isEditing ? (
          <>
            <WhoFields
              idPrefix="detail-who"
              i18nOverridePrefix={props.i18nOverridePrefix}
              taken={who.taken}
              onTakenChange={who.setTaken}
              open={who.open}
              onOpenChange={who.setOpen}
              whoCanJoin={who.whoCanJoin}
              onWhoCanJoinChange={who.setWhoCanJoin}
              maleChecked={who.maleChecked}
              onMaleCheckedChange={who.setMaleChecked}
              male={who.male}
              onMaleChange={who.setMale}
              femaleChecked={who.femaleChecked}
              onFemaleCheckedChange={who.setFemaleChecked}
              female={who.female}
              onFemaleChange={who.setFemale}
              genderOverOpen={who.genderOverOpen}
              gameMood={who.gameMood}
              onGameMoodChange={who.setGameMood}
              autoApprove={who.autoApprove}
              onAutoApproveChange={(next) => (next ? setIsConfirmOpen(true) : who.setAutoApprove(false))}
            />
            {errorLine}
          </>
        ) : (
          <>
            <ViewRow label={t('detail.summary.taken')}>{session.initialSlot + 1}</ViewRow>
            <ViewRow label={t('detail.summary.open')}>{whoSummaryOpen(session, t)}</ViewRow>
            <ViewRow label={t('detail.summary.mood')}>
              <MoodBadge mood={session.gameMood} />
            </ViewRow>
            <ViewRow label={t('detail.summary.autoApprove')}>{session.autoApprove ? yes : no}</ViewRow>
          </>
        )}
      </SessionFormSection>
      <AutoApproveConfirmDialog
        i18nOverridePrefix={props.i18nOverridePrefix}
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          who.setAutoApprove(true);
          setIsConfirmOpen(false);
        }}
      />
    </>
  );
}

/* ---------------------------------------------------------------------- Cost */

function CostSection(props: SectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session } = props;
  const [feeType, setFeeType] = useState<FeeType | undefined>(session.feeType ?? undefined);
  const [feeAmount, setFeeAmount] = useState(session.feeAmountVnd !== null ? String(session.feeAmountVnd) : '');
  const [feeNote, setFeeNote] = useState(session.feeNote ?? '');
  const feeChanged =
    feeType !== undefined &&
    (feeType !== session.feeType || (feeType === 'FIXED' && feeAmount !== String(session.feeAmountVnd ?? '')));
  const noteChanged = feeNote.trim() !== (session.feeNote ?? '');
  const feeValid = feeType !== 'FIXED' || feeAmount !== '';
  const canSave = (feeChanged || noteChanged) && feeValid;
  const save = () => {
    const payload: UpdateSessionPayload = {};
    if (feeChanged && feeType !== undefined) {
      payload.feeType = feeType;
      if (feeType === 'FIXED') payload.feeAmountVnd = Number(feeAmount);
    }
    // The server reads "" as "clear the note".
    if (noteChanged) payload.feeNote = feeNote.trim();
    props.onSave(payload);
  };
  const { actions, errorLine } = useSectionFrame(props, canSave, save);
  const fee = session.feeType === null ? null : formatFeeDisplay(session.feeType, session.feeAmountVnd);
  return (
    <SessionFormSection
      i18nOverridePrefix={props.i18nOverridePrefix}
      title={t('form.sections.cost')}
      open={props.open}
      onOpenChange={props.onOpenChange}
      isEditing={props.isEditing}
      missing={props.missing.filter((field) => field === 'fee')}
      actions={actions}
      scrollIntoViewOnOpen
      scrollIntoViewOnMount
      summary={
        <SectionSummary
          items={[
            { label: t('detail.summary.fee'), value: fee },
            { label: t('detail.summary.feeNote'), value: session.feeNote },
          ]}
        />
      }
    >
      {props.isEditing ? (
        <>
          <CostFields
            idPrefix="detail-cost"
            i18nOverridePrefix={props.i18nOverridePrefix}
            feeType={feeType}
            onFeeTypeChange={setFeeType}
            feeAmount={feeAmount}
            onFeeAmountChange={setFeeAmount}
            feeNote={feeNote}
            onFeeNoteChange={setFeeNote}
          />
          {errorLine}
        </>
      ) : (
        <>
          <ViewRow label={t('detail.summary.fee')}>{fee ?? '...'}</ViewRow>
          <ViewRow label={t('detail.summary.feeNote')}>{session.feeNote ?? '...'}</ViewRow>
        </>
      )}
    </SessionFormSection>
  );
}

/* ------------------------------------------------------------ Session detail */

interface DetailSectionProps extends SectionProps {
  schema: ResolvedSportAttributeSchema;
  refBaseSchema?: ResolvedSportAttributeSchema | null;
  /** The creator's own profile attributes — the `#ref` fields' choice source (as in the create form). */
  refChoiceSource?: Record<string, unknown> | null;
}

function DetailSection(props: DetailSectionProps) {
  const t = useOverridableText('session', props.i18nOverridePrefix);
  const { session, schema } = props;
  const stored = session.attributes ?? {};
  const [values, setValues] = useState<Record<string, unknown>>(stored);
  const [refDraftOptions, setRefDraftOptions] = useState<Record<string, unknown[]>>({});
  const trimmed = pickPaths(values, collectSchemaPaths(schema));
  const canSave = JSON.stringify(trimmed) !== JSON.stringify(pickPaths(stored, collectSchemaPaths(schema)));
  // The server replaces the stored map wholesale; an explicit empty map clears it.
  const save = () => props.onSave({ attributes: trimmed });
  const { actions, errorLine } = useSectionFrame(props, canSave, save);
  const entries = buildAttributeSummary(schema, stored);
  return (
    <SessionFormSection
      i18nOverridePrefix={props.i18nOverridePrefix}
      title={t('create.detail')}
      open={props.open}
      onOpenChange={props.onOpenChange}
      isEditing={props.isEditing}
      actions={actions}
      scrollIntoViewOnOpen
      scrollIntoViewOnMount
      summary={
        <SectionSummary items={entries.map((entry) => ({ label: entry.label, value: entry.text }))} />
      }
    >
      {props.isEditing ? (
        <>
          <SportAttributesFields
            schema={schema}
            values={values}
            onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            refChoiceSource={props.refChoiceSource}
            refDraftOptions={refDraftOptions}
            onAddRefDraftOption={(path, value) =>
              setRefDraftOptions((current) => ({ ...current, [path]: [...(current[path] ?? []), value] }))
            }
            refBaseSchema={props.refBaseSchema}
          />
          {errorLine}
        </>
      ) : (
        <SessionAttributesSummary schema={schema} values={stored} refBaseSchema={props.refBaseSchema} hideHeading />
      )}
    </SessionFormSection>
  );
}

/* ------------------------------------------------- Read-only: Session information */

interface InformationSectionProps {
  i18nOverridePrefix?: string;
  session: Session;
  missing: MissingField[];
  schema: ResolvedSportAttributeSchema | null | undefined;
}

/**
 * CLIENT-SESSION-37: the read-only mode's one section. Everything the six editable sections show (Overview,
 * When, Where, Who, Cost and the sport's Session detail) as flat fields, no sub-headings: collapsed (the
 * default) it is the `field: value` summary, one line per group, expanded one label/value row per field. Same bordered card,
 * border flick and amber "Missing: ..." chip as the other modes' sections.
 */
function InformationSection({ i18nOverridePrefix, session, missing, schema }: InformationSectionProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [open, setOpen] = useState(false);
  const duration = sessionDuration(session);
  const durationText = duration === '' ? null : t('detail.summary.minutes', { count: Number(duration) });
  const location = session.location;
  const yes = t('detail.summary.yes');
  const no = t('detail.summary.no');
  const fee = session.feeType === null ? null : formatFeeDisplay(session.feeType, session.feeAmountVnd);
  const attributes = schema == null ? [] : buildAttributeSummary(schema, session.attributes ?? {});

  // One line per group (Overview, When, Where, Who, Cost, then the sport's Session detail) while collapsed.
  const summaryGroups: SectionSummaryItem[][] = [
    [
      { label: t('detail.summary.sport'), value: session.sportName },
      { label: t('detail.summary.title'), value: session.title },
    ],
    [
      { label: t('detail.summary.starts'), value: formatStartTime(session.scheduledStart) },
      { label: t('detail.summary.duration'), value: durationText },
      { label: t('detail.summary.ends'), value: session.scheduledEndAt === null ? null : formatStartTime(session.scheduledEndAt) },
    ],
    [
      { label: t('detail.summary.location'), value: location?.name },
      { label: t('detail.summary.note'), value: session.locationNote },
    ],
    [
      { label: t('detail.summary.taken'), value: String(session.initialSlot + 1) },
      { label: t('detail.summary.open'), value: whoSummaryOpen(session, t) },
      { label: t('detail.summary.mood'), value: formatGameMood(session.gameMood) },
      { label: t('detail.summary.autoApprove'), value: session.autoApprove ? yes : no },
    ],
    [
      { label: t('detail.summary.fee'), value: fee },
      { label: t('detail.summary.feeNote'), value: session.feeNote },
    ],
    ...(attributes.length > 0 ? [attributes.map((entry) => ({ label: entry.label, value: entry.text }))] : []),
  ];

  return (
    <SessionFormSection
      i18nOverridePrefix={i18nOverridePrefix}
      title={t('detail.information.title')}
      open={open}
      onOpenChange={setOpen}
      missing={missing}
      scrollIntoViewOnOpen
      summary={
        <div className="flex flex-col gap-0.5">
          {summaryGroups.map((items) => (
            <SectionSummary key={items[0].label} items={items} />
          ))}
        </div>
      }
    >
      <ViewRow label={t('detail.summary.sport')}>{session.sportName}</ViewRow>
      <ViewRow label={t('detail.summary.title')}>{session.title ?? '...'}</ViewRow>
      <ViewRow label={t('detail.summary.starts')}>{formatSessionHeaderDateTime(session.scheduledStart, null)}</ViewRow>
      <ViewRow label={t('detail.summary.duration')}>{durationText ?? '...'}</ViewRow>
      <ViewRow label={t('detail.summary.ends')}>
        {session.scheduledEndAt === null ? '...' : formatStartTime(session.scheduledEndAt)}
      </ViewRow>
      <ViewRow label={t('detail.summary.location')}>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* SESSION-24: null on a PREPARING session created without a location. */}
            <span>{location?.name ?? t('card.locationPending')}</span>
            {location !== null && location.latitude !== null && location.longitude !== null && (
              <a
                href={directionsUrl(location.latitude, location.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2sm font-medium text-text-accent hover:underline"
              >
                {t('detail.getDirections')}
              </a>
            )}
          </div>
          {location?.address !== null && location?.address !== undefined && (
            <div className="text-2xs text-text-muted">{location.address}</div>
          )}
        </div>
      </ViewRow>
      <ViewRow label={t('detail.summary.note')}>{session.locationNote ?? '...'}</ViewRow>
      <ViewRow label={t('detail.summary.taken')}>{session.initialSlot + 1}</ViewRow>
      <ViewRow label={t('detail.summary.open')}>{whoSummaryOpen(session, t)}</ViewRow>
      <ViewRow label={t('detail.summary.mood')}>
        <MoodBadge mood={session.gameMood} />
      </ViewRow>
      <ViewRow label={t('detail.summary.autoApprove')}>{session.autoApprove ? yes : no}</ViewRow>
      <ViewRow label={t('detail.summary.fee')}>{fee ?? '...'}</ViewRow>
      <ViewRow label={t('detail.summary.feeNote')}>{session.feeNote ?? '...'}</ViewRow>
      {attributes.map((entry) => (
        <ViewRow key={entry.label} label={entry.label}>
          {entry.text ?? '...'}
        </ViewRow>
      ))}
    </SessionFormSection>
  );
}

/* ----------------------------------------------------------------- Container */

interface SessionDetailSectionsProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  session: Session;
  /** The host of a PREPARING session: only then do the sections get Edit buttons. */
  canEdit: boolean;
  /** Saves one section's fields (`PUT`); `onDone` runs once it succeeded (the section leaves edit mode). */
  onUpdateSession: (payload: UpdateSessionPayload, onDone: () => void) => void;
  isSaving: boolean;
  saveError: string | null;
  /** The location picked for the Where editor, page-owned like the create form's. */
  selectedLocation: Location | null;
  onOpenLocationPicker: () => void;
  locationPicker: LocationPickerProps;
  favorites: CompletionFavorites;
  /** Called when an edit of the Where section ends (Save or Discard), to drop the picked location. */
  onClearLocation: () => void;
  sessionAttributeSchema?: ResolvedSportAttributeSchema | null;
  refBaseSchema?: ResolvedSportAttributeSchema | null;
  refChoiceSource?: Record<string, unknown> | null;
}

/**
 * CLIENT-SESSION-37: for anyone who cannot edit (`canEdit` false) it is the read-only mode: one collapsed
 * "Session information" section, see `InformationSection`. Otherwise, as follows.
 *
 * CLIENT-SESSION-34: the detail modal's five sections (Overview, When, Where, Who, Cost) plus the
 * sport's Session detail, each collapsible (collapsed by default, showing `field: value`). On a
 * PREPARING session the host gets an Edit button in each header: it expands the section and turns it
 * into its form, Discard and Save replace Edit in the header, Save sends only that section's fields,
 * and while one section is being edited the other Edit buttons are disabled. Expanding a section
 * scrolls it fully into view. The amber "Missing: ..." chips (PREPARING only) sit on the section that
 * owns the gap. The location picker is a sibling of the sections, as in the create form.
 */
export function SessionDetailSections({
  i18nOverridePrefix,
  session,
  canEdit,
  onUpdateSession,
  isSaving,
  saveError,
  selectedLocation,
  onOpenLocationPicker,
  locationPicker,
  favorites,
  onClearLocation,
  sessionAttributeSchema,
  refBaseSchema,
  refChoiceSource,
}: SessionDetailSectionsProps) {
  const [editing, setEditing] = useState<SectionKey | null>(null);
  // Bumped when an edit starts: the editing section remounts, so its draft is built from the session as
  // it is *now* (not as it was when the modal opened) and a previous, discarded draft is gone.
  const [editGeneration, setEditGeneration] = useState(0);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    overview: false,
    when: false,
    where: false,
    who: false,
    cost: false,
    detail: false,
  });
  // The warning chips show whatever the session still lacks, whatever its status: a Preparing session
  // the host can still complete, and one that was auto-cancelled (or ended) without its location, fee
  // or duration, which is how the viewer sees why.
  const missing = missingForSession(session);

  const setOpen = (key: SectionKey, open: boolean) =>
    setOpenSections((current) => ({ ...current, [key]: open }));
  const endEdit = (key: SectionKey) => {
    setEditing((current) => (current === key ? null : current));
    if (key === 'where') onClearLocation();
  };

  const sectionProps = (key: SectionKey): SectionProps => ({
    i18nOverridePrefix,
    session,
    open: openSections[key],
    // While a section is being edited it stays open (a collapse would hide the form being typed into).
    onOpenChange: (open) => {
      if (editing === key && !open) return;
      setOpen(key, open);
    },
    canEdit,
    isEditing: editing === key,
    editDisabled: editing !== null && editing !== key,
    missing,
    onEdit: () => {
      setEditing(key);
      setEditGeneration((generation) => generation + 1);
      setOpen(key, true);
    },
    onDiscard: () => endEdit(key),
    onSave: (payload) => onUpdateSession(payload, () => endEdit(key)),
    isSaving,
    saveError,
  });

  // Unique per section (sibling keys must be): `where-view`, then `where-edit-3` while it is edited.
  const keyFor = (key: SectionKey) => `${key}-${editing === key ? `edit-${editGeneration}` : 'view'}`;

  // CLIENT-SESSION-37: read-only mode (not the host of a PREPARING session): one collapsed section.
  if (!canEdit) {
    return (
      <InformationSection
        i18nOverridePrefix={i18nOverridePrefix}
        session={session}
        missing={missing}
        schema={sessionAttributeSchema}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.25">
      <OverviewSection key={keyFor('overview')} {...sectionProps('overview')} />
      <WhenSection key={keyFor('when')} {...sectionProps('when')} />
      <WhereSection
        key={keyFor('where')}
        {...sectionProps('where')}
        selectedLocation={selectedLocation}
        onOpenLocationPicker={onOpenLocationPicker}
        favorites={favorites}
      />
      <WhoSection key={keyFor('who')} {...sectionProps('who')} />
      <CostSection key={keyFor('cost')} {...sectionProps('cost')} />
      {sessionAttributeSchema != null && (
        <DetailSection
          key={keyFor('detail')}
          {...sectionProps('detail')}
          schema={sessionAttributeSchema}
          refBaseSchema={refBaseSchema}
          refChoiceSource={refChoiceSource}
        />
      )}
      <LocationPicker {...locationPicker} />
    </div>
  );
}
