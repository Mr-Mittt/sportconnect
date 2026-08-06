import { useState } from 'react';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import { SPORT_PROFILE_CONFIG } from '@/shared/lib/sportProfileConfig';
import { cn } from '@/shared/lib/utils';
import type { SportKey } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
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
 * Owns its own transient field state locally — the parent resets it by remounting (a changing
 * `key` prop, same convention `AddSportModal`/`CreateGroupModal` already use).
 */
export function AddSportFields({
  availableSports,
  onSubmit,
  isSubmitting,
  isError,
  promptMessage,
}: AddSportFieldsProps) {
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
    <>
      <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {promptMessage !== undefined && (
          <p className="rounded-lg bg-bg-accent px-3 py-2 text-2sm text-text-primary">
            {promptMessage}
          </p>
        )}
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
    </>
  );
}
