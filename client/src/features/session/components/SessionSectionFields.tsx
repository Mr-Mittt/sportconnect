import type { ReactNode } from 'react';
import type { Location } from '@/shared/types/location';
import type { FeeType } from '@/shared/types/session';
import { RequiredMark } from '@/shared/components/RequiredMark';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { SessionTimeFields } from '../sessionFormTime';
import { DigitsOnlyInput } from './DigitsOnlyInput';
import { FeeTypeFields } from './FeeTypeFields';
import { GameMoodSlider } from './GameMoodSlider';
import { LocationFavoritesDropdown } from './LocationFavoritesDropdown';
import { SessionStartTimePicker } from './SessionStartTimePicker';
import type { WhoCanJoin } from '@/shared/lib/sessionSlots';

/** The fee note's length limit (SESSION-46's `feeNote @Size(300)`). */
export const FEE_NOTE_MAX = 300;

interface CommonProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** Distinguishes element ids when two forms could be mounted at once (create form vs. a detail editor). */
  idPrefix: string;
}

/* ------------------------------------------------------------------ Overview */

interface OverviewFieldsProps extends CommonProps {
  title: string;
  onTitleChange: (next: string) => void;
  /** Show the "title is required" line (a refused Create, or a blank title while editing). */
  showTitleError?: boolean;
  /** The sport control — a select in the create form; the detail modal passes none (sport is fixed). */
  sportField?: ReactNode;
}

/** The Overview section: the sport (create only) and the title, which every session needs (SESSION-49). */
export function OverviewFields({
  title,
  onTitleChange,
  showTitleError = false,
  sportField,
  idPrefix,
  i18nOverridePrefix,
}: OverviewFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
      {sportField !== undefined && <div className="sm:col-span-3">{sportField}</div>}
      <div className={sportField !== undefined ? 'sm:col-span-7' : 'sm:col-span-10'}>
        <Label htmlFor={`${idPrefix}-title`}>
          {t('create.titleField.label')}
          <RequiredMark />
        </Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t('create.titleField.placeholder')}
          aria-invalid={showTitleError || undefined}
        />
        {showTitleError && <p className="mt-1 text-2xs text-text-danger">{t('create.validation.title')}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- When */

interface WhenFieldsProps extends CommonProps {
  time: SessionTimeFields;
  /** Re-keys the start picker (a sport change resets the form and re-runs its "now + 1h" default). */
  startPickerKey?: string;
  showStartError?: boolean;
  /** The create form requires a start (red asterisk); the detail editor always has one. */
  startRequired?: boolean;
}

/**
 * The When section: Starts at, Duration and Ends at. They are linked by `useSessionTimeFields` —
 * the one edited last is the source; the end may fall on the next day (its picker shows the date)
 * and must be after the start.
 */
export function WhenFields({
  time,
  startPickerKey,
  showStartError = false,
  startRequired = true,
  idPrefix,
  i18nOverridePrefix,
}: WhenFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <div className="flex flex-col gap-3.5">
      {/* Wide: Starts at + Duration on the first line, Ends at on the second (they do not fit on one);
          a phone stacks all three. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
        <div className="sm:col-span-8">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
            {t('create.startsAt.label')}
            {startRequired && <RequiredMark />}
          </span>
          <SessionStartTimePicker key={startPickerKey} value={time.start} onChange={time.setStart} disallowPast />
          {showStartError && time.start === '' && (
            <p className="mt-1 text-2xs text-text-danger">{t('create.validation.startTime')}</p>
          )}
          {time.isStartInPast && (
            <p className="mt-1 text-2xs text-text-danger" role="alert">{t('create.validation.startInPast')}</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${idPrefix}-duration`}>{t('create.duration.label')}</Label>
          <DigitsOnlyInput
            id={`${idPrefix}-duration`}
            min={1}
            value={time.duration}
            onChange={(event) => time.setDuration(event.target.value)}
            placeholder={t('create.duration.placeholder')}
          />
        </div>
        <div className="sm:col-span-8">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
            {t('create.endsAt.label')}
          </span>
          <SessionStartTimePicker
            field={t('create.endsAt.label')}
            prefillWhenEmpty={false}
            value={time.end}
            onChange={time.setEnd}
          />
        </div>
      </div>
      {time.isEndInvalid && <p className="text-2xs text-text-danger">{t('create.validation.endAfterStart')}</p>}
    </div>
  );
}

/* --------------------------------------------------------------------- Where */

interface WhereFieldsProps extends CommonProps {
  /** The location in force: the one just picked, else the session's stored one (detail editor). */
  location: Location | null;
  favorites: Location[];
  isFavoritesLoading: boolean;
  /** The create form blocks the picker until a sport is chosen. */
  pickerDisabled?: boolean;
  onSelectFavorite: (location: Location) => void;
  onOpenPicker: () => void;
  note: string;
  onNoteChange: (next: string) => void;
  pickSportFirst?: boolean;
}

/** The Where section: the location (favourites dropdown + full picker) and its note. */
export function WhereFields({
  location,
  favorites,
  isFavoritesLoading,
  pickerDisabled = false,
  onSelectFavorite,
  onOpenPicker,
  note,
  onNoteChange,
  pickSportFirst = false,
  idPrefix,
  i18nOverridePrefix,
}: WhereFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
      <div className="sm:col-span-7">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
          {t('create.location.label')}
        </span>
        <div className="flex items-center gap-2">
          {location !== null && (
            <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{location.name}</span>
          )}
          <LocationFavoritesDropdown
            selectedLocation={location}
            favorites={favorites}
            isFavoritesLoading={isFavoritesLoading}
            disabled={pickerDisabled}
            onSelectFavorite={onSelectFavorite}
            onOpenLocationPicker={onOpenPicker}
          />
        </div>
        {pickSportFirst && <p className="mt-1 text-2xs text-text-muted">{t('create.location.pickSportFirst')}</p>}
      </div>
      <div className="sm:col-span-3">
        <Label htmlFor={`${idPrefix}-location-note`}>{t('create.locationNote.label')}</Label>
        <Input
          id={`${idPrefix}-location-note`}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={t('create.locationNote.placeholder')}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- Who */

interface WhoFieldsProps extends CommonProps {
  taken: string;
  onTakenChange: (next: string) => void;
  open: string;
  onOpenChange: (next: string) => void;
  /** The create form requires the open slot (red asterisk, error line once a submit was attempted). */
  openRequired?: boolean;
  showOpenError?: boolean;
  whoCanJoin: WhoCanJoin;
  onWhoCanJoinChange: (next: WhoCanJoin) => void;
  maleChecked: boolean;
  onMaleCheckedChange: (next: boolean) => void;
  male: string;
  onMaleChange: (next: string) => void;
  femaleChecked: boolean;
  onFemaleCheckedChange: (next: boolean) => void;
  female: string;
  onFemaleChange: (next: string) => void;
  /** Male + female is more than the open slots. */
  genderOverOpen: boolean;
  gameMood: number;
  onGameMoodChange: (next: number) => void;
  autoApprove: boolean;
  /** Already routed through the "turn on auto approve?" confirmation by the container. */
  onAutoApproveChange: (next: boolean) => void;
  /** Create-only extras under the checkbox (the invite-friends field). */
  extra?: ReactNode;
  /** `{taken}/{capacity}` helper line under the two slot inputs (create form). */
  slotsSummary?: string;
}

/**
 * The Who section: Taken and Open slot, the "Who can join" radios (Anyone / By gender, with the
 * Male slot and Female slot checkboxes and their two-digit inputs nested under By gender), the game
 * mood slider and the auto approve checkbox. Controlled and presentational; the container owns the
 * draft and the confirmation popup for auto approve.
 */
export function WhoFields({
  taken,
  onTakenChange,
  open,
  onOpenChange,
  openRequired = false,
  showOpenError = false,
  whoCanJoin,
  onWhoCanJoinChange,
  maleChecked,
  onMaleCheckedChange,
  male,
  onMaleChange,
  femaleChecked,
  onFemaleCheckedChange,
  female,
  onFemaleChange,
  genderOverOpen,
  gameMood,
  onGameMoodChange,
  autoApprove,
  onAutoApproveChange,
  extra,
  slotsSummary,
  idPrefix,
  i18nOverridePrefix,
}: WhoFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const byGender = whoCanJoin === 'BY_GENDER';
  return (
    <div className="flex flex-col gap-3.5">
      {/* "Who can join" sits to the right of Open slot on one row (it wraps under them on a narrow screen). */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3.5">
        <div>
          <div className="flex gap-3.5">
            <div className="w-28">
              <Label htmlFor={`${idPrefix}-taken-slots`}>{t('create.takenSlot.label')}</Label>
              <DigitsOnlyInput
                id={`${idPrefix}-taken-slots`}
                min={0}
                value={taken}
                onChange={(event) => onTakenChange(event.target.value)}
                placeholder={t('create.slots.placeholder')}
              />
            </div>
            <div className="w-28">
              <Label htmlFor={`${idPrefix}-open-slots`}>
                {t('create.openSlot.label')}
                {openRequired && <RequiredMark />}
              </Label>
              <DigitsOnlyInput
                id={`${idPrefix}-open-slots`}
                aria-required={openRequired ? 'true' : undefined}
                min={0}
                value={open}
                onChange={(event) => onOpenChange(event.target.value)}
                placeholder={t('create.slots.placeholder')}
              />
              {showOpenError && open === '' && (
                <p className="mt-1 text-2xs text-text-danger">{t('create.validation.openSlot')}</p>
              )}
            </div>
          </div>
          {slotsSummary !== undefined && <p className="mt-1.5 text-2xs text-text-muted">{slotsSummary}</p>}
        </div>

      <fieldset className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-text-secondary select-none">
          {t('create.whoCanJoin.label')}
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
          <input
            type="radio"
            name={`${idPrefix}-who-can-join`}
            checked={!byGender}
            onChange={() => onWhoCanJoinChange('ANYONE')}
            className="size-4 cursor-pointer"
          />
          {t('create.whoCanJoin.anyone')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
          <input
            type="radio"
            name={`${idPrefix}-who-can-join`}
            checked={byGender}
            onChange={() => onWhoCanJoinChange('BY_GENDER')}
            className="size-4 cursor-pointer"
          />
          {t('create.whoCanJoin.byGender')}
        </label>
        {/* Male and female slot, one per row, nested under "By gender". */}
        <div className="ml-6 flex flex-col gap-2 border-l-2 border-border pl-3">
          <div className="flex items-center gap-3">
            <label className="flex w-28 cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
              <input
                type="checkbox"
                disabled={!byGender}
                checked={maleChecked}
                onChange={(event) => onMaleCheckedChange(event.target.checked)}
                className="size-4 cursor-pointer rounded border-border-strong disabled:cursor-not-allowed"
              />
              {t('create.slots.male')}
            </label>
            <DigitsOnlyInput
              id={`${idPrefix}-male-slots`}
              aria-label={t('create.slots.maleInput')}
              className="w-14 px-1 py-1.5 text-center"
              disabled={!byGender || !maleChecked}
              min={1}
              value={male}
              onChange={(event) => onMaleChange(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex w-28 cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
              <input
                type="checkbox"
                disabled={!byGender}
                checked={femaleChecked}
                onChange={(event) => onFemaleCheckedChange(event.target.checked)}
                className="size-4 cursor-pointer rounded border-border-strong disabled:cursor-not-allowed"
              />
              {t('create.slots.female')}
            </label>
            <DigitsOnlyInput
              id={`${idPrefix}-female-slots`}
              aria-label={t('create.slots.femaleInput')}
              className="w-14 px-1 py-1.5 text-center"
              disabled={!byGender || !femaleChecked}
              min={1}
              value={female}
              onChange={(event) => onFemaleChange(event.target.value)}
            />
          </div>
        </div>
        {genderOverOpen && <p className="text-2xs text-text-danger">{t('create.validation.genderOverOpen')}</p>}
      </fieldset>

      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
          {t('create.mood.label')}
        </span>
        <GameMoodSlider id={`${idPrefix}-game-mood`} value={gameMood} onChange={onGameMoodChange} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="checkbox"
          checked={autoApprove}
          onChange={(event) => onAutoApproveChange(event.target.checked)}
          className="size-4 cursor-pointer rounded border-border-strong"
        />
        {t('create.autoApprove.label')}
      </label>

      {extra}
    </div>
  );
}

/* ---------------------------------------------------------------------- Cost */

interface CostFieldsProps extends CommonProps {
  feeType: FeeType | undefined;
  onFeeTypeChange: (next: FeeType | undefined) => void;
  feeAmount: string;
  onFeeAmountChange: (next: string) => void;
  feeNote: string;
  onFeeNoteChange: (next: string) => void;
}

/** The Cost section: the fee (Free / Split / Fixed amount) and the optional fee note with its counter. */
export function CostFields({
  feeType,
  onFeeTypeChange,
  feeAmount,
  onFeeAmountChange,
  feeNote,
  onFeeNoteChange,
  idPrefix,
  i18nOverridePrefix,
}: CostFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
          {t('create.fee.label')}
        </span>
        <FeeTypeFields
          value={feeType}
          onChange={onFeeTypeChange}
          amount={feeAmount}
          onAmountChange={onFeeAmountChange}
          idPrefix={idPrefix}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-fee-note`}>{t('create.feeNote.label')}</Label>
        <Input
          id={`${idPrefix}-fee-note`}
          value={feeNote}
          maxLength={FEE_NOTE_MAX}
          onChange={(event) => onFeeNoteChange(event.target.value)}
          placeholder={t('create.feeNote.placeholder')}
        />
        <p className="mt-1 text-right text-2xs text-text-muted">
          {t('create.feeNote.counter', { count: feeNote.length, max: FEE_NOTE_MAX })}
        </p>
      </div>
    </div>
  );
}
