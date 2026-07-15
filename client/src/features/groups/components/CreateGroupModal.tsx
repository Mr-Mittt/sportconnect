import { useState } from 'react';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import {
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_NAME_LENGTH,
} from '@/features/feed/types';
import type { CreateGroupPayload } from '@/features/feed/types';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  sportsByKey: Record<SportKey, SportProfile>;
  /** null renders a sport picker; a specific sport locks the form to it
   * (FEED-5 user decision — opening "Create Group" from a sport-filtered
   * Groups page context creates a group for that sport directly). */
  lockedSport: SportKey | null;
  onSubmit: (payload: CreateGroupPayload) => void;
  isSubmitting: boolean;
  isError: boolean;
}

/**
 * FEED-5's real group-creation form — name, sport (locked or picked),
 * optional description, private toggle. Presentational and controlled per
 * client/CLAUDE.md: the parent (GroupsPage) owns `useCreateGroup()` and
 * passes `onSubmit`/`isSubmitting`/`isError` down, so this stays
 * Storybook-testable without a TanStack Query provider — same shape as
 * CreatePostForm.
 *
 * Still owns its own transient form field state locally (groupName,
 * selectedSport, description, isPrivate) — pure UI input values, same
 * "owns its own transient state" precedent as CreatePostForm's textarea.
 * These need to reset on every *open*, not just after a submit; rather than
 * an effect that calls setState (React's own guidance: avoid synchronous
 * setState-in-effect, which causes an extra render pass), GroupsPage
 * remounts this component fresh on each open via a changing `key` prop, so
 * these useState initializers just naturally start clean every time.
 */
export function CreateGroupModal({
  isOpen,
  onClose,
  sportsByKey,
  lockedSport,
  onSubmit,
  isSubmitting,
  isError,
}: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(lockedSport ?? '');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const effectiveSport = lockedSport ?? selectedSport;
  const isValid = groupName.trim().length >= MIN_GROUP_NAME_LENGTH && effectiveSport !== '';

  const submit = () => {
    if (!isValid) return;
    onSubmit({
      sportId: SPORT_ID_BY_KEY[effectiveSport as SportKey],
      groupName: groupName.trim(),
      description: description.trim() || undefined,
      isPrivate,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="border-hairline-b flex items-center justify-between border-border px-4 py-3">
          <DialogTitle>Create a group</DialogTitle>
          <DialogClose aria-label="Close" />
        </div>
        <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
          <div>
            <Label htmlFor="create-group-name">Group name</Label>
            <Input
              id="create-group-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value.slice(0, MAX_GROUP_NAME_LENGTH))}
              maxLength={MAX_GROUP_NAME_LENGTH}
              placeholder="e.g. Riverside Ballers"
            />
          </div>
          {lockedSport === null && (
            <div>
              <Label htmlFor="create-group-sport">Sport</Label>
              <Select
                id="create-group-sport"
                value={selectedSport}
                onChange={(event) => setSelectedSport(event.target.value as SportKey)}
              >
                <option value="" disabled>
                  Select a sport
                </option>
                {Object.values(sportsByKey).map((sport) => (
                  <option key={sport.key} value={sport.key}>
                    {sport.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="create-group-description">Description (optional)</Label>
            <textarea
              id="create-group-description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value.slice(0, MAX_GROUP_DESCRIPTION_LENGTH))
              }
              maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
              rows={3}
              placeholder="What's this group about?"
              className="w-full resize-none rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary select-none">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              className="size-4 cursor-pointer rounded border-border-strong"
            />
            Private group
          </label>
          {isError && (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't create the group. Try again.
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
            {isSubmitting ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
