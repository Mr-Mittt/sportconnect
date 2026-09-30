import { useState } from 'react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { SKILL_LEVELS } from '@/shared/lib/skillLevels';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
import { digitsOnlyInputProps } from '@/shared/lib/inputGuards';
import { cn } from '@/shared/lib/utils';
import type { ResumablePrevious } from '@/shared/hooks/useResumableSports';
import type { SportKey } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

/**
 * SPORT-10: a fresh create carries the form fields; a reactivate (the sport
 * has a soft-deleted profile) carries only `{ sportId, isResume: true }` —
 * backend A20 restores the old row verbatim and ignores every other field.
 */
export type AddSportProfileSubmission =
  | { sportId: number; skillLevel: string; yearsOfExperience?: number; isResume?: false }
  | { sportId: number; isResume: true };

interface AddSportFieldsProps {
  /** Sports the caller doesn't already have an active profile for — the
   * only ones offered here. SportSwitcher's own aria-disabled cap already
   * keeps this from being reachable once a user has 3 profiles, so this
   * list is never expected to be empty in normal use — the empty state
   * below exists as a safety net, not the primary guard. */
  availableSports: SportKey[];
  onSubmit: (payload: AddSportProfileSubmission) => void;
  isSubmitting: boolean;
  isError: boolean;
  /** A callout rendered above the Sport field — used when this is reached by the "tried to
   * create/join a match with zero sport profiles" gate (CLIENT-SESSION-7 follow-up) rather than
   * the standalone `AddSportModal` (SportSwitcher's own dashed "+" pill), which leaves this unset. */
  promptMessage?: string;
  /** SPORT-10: sports the caller can *reactivate* (a soft-deleted profile exists) mapped to the
   * previous skill/YoE. When the selected sport is in here, the skill/YoE fields render
   * pre-filled and read-only and the primary button becomes "Reactivate" (`isResume: true`) —
   * A20 ignores request-body edits on resume, so the fields are deliberately not editable. */
  resumableProfiles?: Map<SportKey, ResumablePrevious>;
  /** SPORT-10: when provided, a "Cancel" button is shown next to "Reactivate" in the reactivate
   * state. `AddSportModal` wires it to its own `onClose`; the inline session-modal gates leave it
   * unset (the outer modal owns cancel there). */
  onCancel?: () => void;
  /** SPORT-10: pre-select this sport instead of `availableSports[0]` — used when the
   * Profile-page `SportSwitcher`'s deactivated pill opens the modal already targeting that sport. */
  initialSport?: SportKey;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * SPORT-1's "Add sport" fields — sport + skill level (required, matches
 * `CreateUserSportProfileRequest`'s own required fields) plus optional years of experience.
 * Extracted out of `AddSportModal` (CLIENT-SESSION-7 follow-up) so the exact same fields can
 * also render *inline* inside `CreateSessionModal`/`SessionDiscoverModal` when the caller has
 * zero sport profiles — the create/join flow stays on the same mounted Dialog instead of
 * stacking a second one (this codebase has hit the nested-Radix-Dialog aria-hide bug three times
 * already — CLIENT-SESSION-2's Popover/DropdownMenu-in-Dialog reverts, CLIENT-SESSION-5's
 * location-favorites fix — so a second top-level Dialog is deliberately avoided here too).
 *
 * SPORT-10: if the selected sport has a soft-deleted profile (`resumableProfiles`), this renders
 * the *reactivate* variant instead — pre-filled read-only skill/YoE, a "Reactivate" primary
 * button that submits `{ sportId, isResume: true }`, and an optional "Cancel".
 *
 * Owns its own transient field state locally — the parent resets it by remounting (a changing
 * `key` prop, same convention `AddSportModal`/`CreateGroupModal` already use).
 */
export function AddSportFields({
  availableSports,
  onSubmit,
  isSubmitting,
  isError,
  promptMessage,
  resumableProfiles,
  onCancel,
  initialSport,
  i18nOverridePrefix,
}: AddSportFieldsProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(
    initialSport ?? availableSports[0] ?? '',
  );
  const [skillLevel, setSkillLevel] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');

  const resumable =
    selectedSport !== '' ? resumableProfiles?.get(selectedSport as SportKey) : undefined;
  const isResumeMode = resumable !== undefined;

  const isValid = isResumeMode ? selectedSport !== '' : selectedSport !== '' && skillLevel !== '';

  const submit = () => {
    if (!isValid || selectedSport === '') return;
    // selectedSport only ever holds a key from availableSports, which is always catalog-derived
    // — the ?? 0 fallback is defensive, not reachable in practice.
    const sportId = sportIdForKey(selectedSport as SportKey) ?? 0;
    if (isResumeMode) {
      onSubmit({ sportId, isResume: true });
      return;
    }
    onSubmit({
      sportId,
      skillLevel,
      yearsOfExperience: yearsOfExperience === '' ? undefined : Number(yearsOfExperience),
    });
  };

  return (
    <>
      <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {promptMessage !== undefined && (
          <p className="rounded-lg bg-bg-accent px-3 py-2 text-2sm text-text-primary">
            {promptMessage}
          </p>
        )}
        {availableSports.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('addSport.allSportsAdded')}
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="add-sport-sport">{t('addSport.sport')}</Label>
              <Select
                id="add-sport-sport"
                value={selectedSport}
                onChange={(event) => setSelectedSport(event.target.value as SportKey)}
              >
                {availableSports.map((key) => (
                  <option key={key} value={key}>
                    {getSportProfileConfig(key).label}
                  </option>
                ))}
              </Select>
            </div>
            {isResumeMode && (
              <p className="text-2sm text-text-secondary">
                {t('addSport.resumeNote', {
                  sport: getSportProfileConfig(selectedSport as SportKey).label,
                })}
              </p>
            )}
            <div>
              <Label htmlFor="add-sport-skill">{t('addSport.skillLevel')}</Label>
              <Select
                id="add-sport-skill"
                value={isResumeMode ? (resumable?.skillLevel ?? '') : skillLevel}
                onChange={(event) => setSkillLevel(event.target.value)}
                disabled={isResumeMode}
              >
                <option value="" disabled>
                  {t('addSport.skillLevelPlaceholder')}
                </option>
                {SKILL_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(`skillLevels.${level}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="add-sport-experience">{t('addSport.yearsOfExperience')}</Label>
              <Input
                id="add-sport-experience"
                type="number"
                {...digitsOnlyInputProps}
                min={0}
                value={
                  isResumeMode ? (resumable?.yearsOfExperience ?? '') : yearsOfExperience
                }
                onChange={(event) => setYearsOfExperience(event.target.value)}
                disabled={isResumeMode}
              />
            </div>
          </>
        )}
        {isError && (
          <p role="alert" className="text-2sm text-text-danger">
            {t('addSport.error')}
          </p>
        )}
      </div>
      <div className="border-hairline-t flex justify-end gap-2 border-border px-4 py-3">
        {isResumeMode && onCancel !== undefined && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t('addSport.cancel')}
          </Button>
        )}
        <Button
          variant="primary"
          onClick={submit}
          disabled={!isValid || isSubmitting}
          className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          {isResumeMode
            ? isSubmitting
              ? t('addSport.reactivating')
              : t('addSport.reactivate')
            : isSubmitting
              ? t('addSport.submitting')
              : t('addSport.submit')}
        </Button>
      </div>
    </>
  );
}
