import { SKILL_LEVELS } from '@/shared/lib/skillLevels';
import { cn } from '@/shared/lib/utils';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import type { ResolvedSportAttributeSchema, UserSportProfileResponse } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import type { SportProfileEditDraft } from '../sportProfileEditDraft';

interface SportProfileSettingsTabProps {
  activeProfile: UserSportProfileResponse | undefined;
  isLoading: boolean;
  schema: ResolvedSportAttributeSchema | null;
  draft: SportProfileEditDraft;
  setSkillLevel: (value: string) => void;
  setYearsOfExperience: (value: string) => void;
  setAttribute: (key: string, value: unknown) => void;
  isDirty: boolean;
  onSave: () => void;
  isSaving: boolean;
  errorMessage: string | null;
  /** SPORT-10: opens `ProfilePage`'s confirm dialog for the Active toggle. The tab itself never
   * fires the `DELETE` / `isResume` mutation — `ProfilePage` owns those (controlled, not
   * self-contained). */
  onToggleActive: () => void;
  /** SPORT-10: the deactivate/reactivate mutation is in flight — the toggle is disabled. */
  isTogglingActive: boolean;
}

/** SPORT-10: the Active/Inactive pill toggle — first control in the tab. Mirrors
 * `GroupSettingsTab`'s `ToggleFieldRow` shape. Lives outside the read-only `<fieldset>` below so
 * it stays interactive while the profile is Inactive. */
function ActiveToggleRow({
  sportName,
  isActive,
  onToggle,
  isBusy,
}: {
  sportName: string;
  isActive: boolean;
  onToggle: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-2sm font-medium text-text-primary">Active</div>
        <div className="text-2xs text-text-muted">
          {isActive
            ? `You're playing ${sportName} — it shows in your sport switcher.`
            : `${sportName} is deactivated — your details are kept, reactivate any time.`}
        </div>
      </div>
      <Switch
        checked={isActive}
        onCheckedChange={onToggle}
        disabled={isBusy}
        aria-label={`${sportName} profile: ${isActive ? 'Active' : 'Inactive'}`}
      />
    </div>
  );
}

/**
 * The `/profile` page's Settings tab (PROFILE-4) — a per-sport profile editor for the base
 * `UserSportProfile` fields (`skillLevel`/`yearsOfExperience`, first editable anywhere in the app
 * since `AddSportModal` set them at creation time) plus `SportAttributesFields` (SPORT-2) for the
 * same active sport. This is the ticket that finally hosts that component.
 *
 * SPORT-8: the free-text "Preferred position" field was removed — a fixed position column was a
 * mistake (position is sport-specific and belongs in the per-sport A9 attribute schema). Pairs
 * with backend A18.
 *
 * **Controlled, not self-contained (PROFILE-10 delta).** Originally owned `useSportProfileSettingsTabData()`
 * directly (PROFILE-4, "since no ProfilePage exists yet to wire one down") — converted once
 * `ProfilePage` (PROFILE-6) existed and PROFILE-10 needed to guard leaving this tab with unsaved
 * edits (a tab switch, a `SportSwitcher` pill click, in-app navigation): `ProfilePage` is the only
 * place that can intercept those, so it now owns the data hook and passes its fields down, same
 * shape as `GroupSettingsTab`/`GroupsPage`.
 */
export function SportProfileSettingsTab({
  activeProfile,
  isLoading,
  schema,
  draft,
  setSkillLevel,
  setYearsOfExperience,
  setAttribute,
  isDirty,
  onSave,
  isSaving,
  errorMessage,
  onToggleActive,
  isTogglingActive,
}: SportProfileSettingsTabProps) {
  if (isLoading) return null;

  if (activeProfile === undefined) {
    return (
      <p className="py-4 text-sm text-text-secondary">
        Add a sport above to set up its profile.
      </p>
    );
  }

  const isActive = activeProfile.isActive;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <ActiveToggleRow
        sportName={activeProfile.sportName}
        isActive={isActive}
        onToggle={onToggleActive}
        isBusy={isTogglingActive}
      />

      {/* SPORT-10: a native disabled <fieldset> makes every control below (incl. all of
          SportAttributesFields' nested inputs and the Save button) read-only while the profile
          is Inactive — no per-field prop threading. */}
      <fieldset
        disabled={!isActive}
        className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0 disabled:opacity-60"
      >
      <div className="flex flex-col gap-3.5">
        <h3 className="text-sm font-semibold text-text-primary">Sport profile</h3>
        <div>
          <Label htmlFor="sport-profile-skill-level">Skill level</Label>
          <Select
            id="sport-profile-skill-level"
            value={draft.skillLevel}
            onChange={(event) => setSkillLevel(event.target.value)}
          >
            <option value="" disabled>
              Select a skill level
            </option>
            {SKILL_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sport-profile-experience">Years of experience</Label>
          <Input
            id="sport-profile-experience"
            type="number"
            min={0}
            value={draft.yearsOfExperience}
            onChange={(event) => setYearsOfExperience(event.target.value)}
          />
        </div>
      </div>

      {schema !== null && (
        <SportAttributesFields schema={schema} values={draft.attributes} onChange={setAttribute} />
      )}

      {errorMessage !== null && (
        <p role="alert" className="text-2sm text-text-danger">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={!isActive || !isDirty || draft.skillLevel === '' || isSaving}
        className={cn('self-start cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
      >
        {isSaving ? 'Saving…' : 'Save changes'}
      </Button>
      </fieldset>
    </form>
  );
}
