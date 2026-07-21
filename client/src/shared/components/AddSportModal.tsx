import { useState } from 'react';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import { SPORT_PROFILE_CONFIG } from '@/shared/lib/sportProfileConfig';
import { cn } from '@/shared/lib/utils';
import type { SportKey } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export interface AddSportProfileSubmission {
  sportId: number;
  skillLevel: string;
  yearsOfExperience?: number;
}

interface AddSportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sports the caller doesn't already have an active profile for — the
   * only ones offered here. SportSwitcher's own aria-disabled cap already
   * keeps this modal from being reachable once a user has 3 profiles, so
   * this list is never expected to be empty in normal use — the empty
   * state below exists as a safety net, not the primary guard. */
  availableSports: SportKey[];
  onSubmit: (payload: AddSportProfileSubmission) => void;
  isSubmitting: boolean;
  isError: boolean;
}

/**
 * SPORT-1's "Add sport" flow — sport + skill level (required, matches
 * `CreateUserSportProfileRequest`'s own required fields) plus optional years
 * of experience. Presentational and controlled, same shape as
 * CreateGroupModal: the parent owns `useAddSportProfile()` and passes
 * `onSubmit`/`isSubmitting`/`isError` down. Bio/preferred position (also on
 * the backend DTO) are left for a future profile-editing screen — out of
 * scope for "add a sport profile for the first time."
 *
 * Owns its own transient field state locally, reset on every *open* via a
 * changing `key` prop from the parent (same reasoning as CreateGroupModal —
 * avoids a setState-in-effect reset).
 */
export function AddSportModal({
  isOpen,
  onClose,
  availableSports,
  onSubmit,
  isSubmitting,
  isError,
}: AddSportModalProps) {
  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(availableSports[0] ?? '');
  const [skillLevel, setSkillLevel] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');

  const isValid = selectedSport !== '' && skillLevel !== '';

  const submit = () => {
    if (!isValid) return;
    onSubmit({
      sportId: SPORT_ID_BY_KEY[selectedSport as SportKey],
      skillLevel,
      yearsOfExperience: yearsOfExperience === '' ? undefined : Number(yearsOfExperience),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader title="Add a sport" className="border-hairline-b border-border px-4 py-3" />
        <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
          {availableSports.length === 0 ? (
            <p className="text-sm text-text-secondary">
              You already have a profile for every sport SportHub supports right now.
            </p>
          ) : (
            <>
              <div>
                <Label htmlFor="add-sport-sport">Sport</Label>
                <Select
                  id="add-sport-sport"
                  value={selectedSport}
                  onChange={(event) => setSelectedSport(event.target.value as SportKey)}
                >
                  {availableSports.map((key) => (
                    <option key={key} value={key}>
                      {SPORT_PROFILE_CONFIG[key].label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="add-sport-skill">Skill level</Label>
                <Select
                  id="add-sport-skill"
                  value={skillLevel}
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
                <Label htmlFor="add-sport-experience">Years of experience (optional)</Label>
                <Input
                  id="add-sport-experience"
                  type="number"
                  min={0}
                  value={yearsOfExperience}
                  onChange={(event) => setYearsOfExperience(event.target.value)}
                />
              </div>
            </>
          )}
          {isError && (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't add that sport. Try again.
            </p>
          )}
        </div>
        <div className="border-hairline-t flex justify-end border-border px-4 py-3">
          <Button
            variant="primary"
            onClick={submit}
            disabled={!isValid || isSubmitting}
            className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
          >
            {isSubmitting ? 'Adding…' : 'Add sport'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
