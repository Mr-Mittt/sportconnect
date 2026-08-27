import { SKILL_LEVELS } from '@/shared/lib/skillLevels';
import { cn } from '@/shared/lib/utils';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { useSportProfileSettingsTabData } from '../useSportProfileSettingsTabData';

/**
 * The `/profile` page's Settings tab (PROFILE-4) — a per-sport profile editor for the base
 * `UserSportProfile` fields (`skillLevel`/`yearsOfExperience`/`preferredPosition`, first editable
 * anywhere in the app since `AddSportModal` set them at creation time) plus `SportAttributesFields`
 * (SPORT-2) for the same active sport. This is the ticket that finally hosts that component.
 *
 * Self-contained, like `PostsTab` — owns its data/draft via `useSportProfileSettingsTabData`
 * rather than receiving props, since no `ProfilePage` (`PROFILE-6`) exists yet to wire one down.
 */
export function SportProfileSettingsTab() {
  const {
    activeProfile,
    isLoading,
    schema,
    draft,
    setSkillLevel,
    setYearsOfExperience,
    setPreferredPosition,
    setAttribute,
    isDirty,
    save,
    isSaving,
    errorMessage,
  } = useSportProfileSettingsTabData();

  if (isLoading) return null;

  if (activeProfile === undefined) {
    return (
      <p className="py-4 text-sm text-text-secondary">
        Add a sport above to set up its profile.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
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
        <div>
          <Label htmlFor="sport-profile-position">Preferred position</Label>
          <Input
            id="sport-profile-position"
            value={draft.preferredPosition}
            onChange={(event) => setPreferredPosition(event.target.value)}
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
        disabled={!isDirty || draft.skillLevel === '' || isSaving}
        className={cn('self-start cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
      >
        {isSaving ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
