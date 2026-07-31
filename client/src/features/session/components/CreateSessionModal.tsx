import { useState } from 'react';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import type { CreateSessionPayload } from '../types';

export interface ManageableGroup {
  id: number;
  groupName: string;
  sportId: number;
}

type CreateSessionMode = 'standalone' | 'group';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** Groups where the caller's role is owner/admin — empty hides the mode toggle entirely
   * (standalone-only), matching the backend's canManageMembers gate on group-linked creation. */
  manageableGroups: ManageableGroup[];
  sportsByKey: Record<SportKey, SportProfile>;

  /** The location chosen via the nested LocationPicker — page-owned (useLocationPickerData's
   * onSelect fires at the page level, not from this component), so this modal reads it as a
   * prop rather than owning it as local state. */
  selectedLocation: Location | null;
  /** Called with the form's currently-effective sportId when "Choose location" is clicked —
   * the page uses it to scope useLocationPickerData's search to the right sport. */
  onOpenLocationPicker: (sportId: number) => void;
  locationPicker: LocationPickerProps;

  onSubmit: (payload: CreateSessionPayload) => void;
  isSubmitting: boolean;
  isError: boolean;
}

/**
 * CLIENT-SESSION-1's session-creation form — mode toggle (standalone vs. for a group the
 * caller manages), sport or group picker, title/description, the required location (via
 * `LocationPicker`), scheduled start, and optional duration/location note. Presentational and
 * controlled per client/CLAUDE.md: the parent (`useMatchesPageData`) owns `useCreateSession()`
 * and `useLocationPickerData()`, passing `onSubmit`/`isSubmitting`/`isError` and the full
 * `locationPicker` prop bundle down — matches `CreateGroupModal`'s shape.
 *
 * Owns its own transient form field state locally (mode, sport/group selection, title,
 * description, locationNote, scheduledStart, durationMinutes) — same "owns its own transient
 * state, remounted via a changing `key` prop on each open" precedent `CreateGroupModal` uses,
 * rather than a setState-in-effect reset. `selectedLocation` is the one field that can't be
 * local state, since the callback that sets it (`useLocationPickerData`'s `onSelect`) lives at
 * the page level, not in this component.
 */
export function CreateSessionModal({
  isOpen,
  onClose,
  manageableGroups,
  sportsByKey,
  selectedLocation,
  onOpenLocationPicker,
  locationPicker,
  onSubmit,
  isSubmitting,
  isError,
}: CreateSessionModalProps) {
  const [mode, setMode] = useState<CreateSessionMode>('standalone');
  const [selectedSport, setSelectedSport] = useState<SportKey | ''>('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  const effectiveSportId =
    mode === 'standalone'
      ? selectedSport !== ''
        ? SPORT_ID_BY_KEY[selectedSport]
        : undefined
      : manageableGroups.find((group) => group.id === selectedGroupId)?.sportId;

  const isValid =
    effectiveSportId !== undefined &&
    selectedLocation !== null &&
    scheduledStart !== '' &&
    (mode === 'standalone' || selectedGroupId !== '');

  const submit = () => {
    if (!isValid || effectiveSportId === undefined || selectedLocation === null) return;
    onSubmit({
      groupId: mode === 'group' ? (selectedGroupId as number) : undefined,
      sportId: mode === 'standalone' ? effectiveSportId : undefined,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      locationId: selectedLocation.id,
      locationNote: locationNote.trim() || undefined,
      scheduledStart: `${scheduledStart}:00`,
      durationMinutes: durationMinutes !== '' ? Number(durationMinutes) : undefined,
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent fixedHeight>
          <DialogHeader title="Create a session" className="border-hairline-b border-border px-4 py-3" />
          <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
            {manageableGroups.length > 0 && (
              <div role="group" aria-label="Session type" className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={mode === 'standalone'}
                  onClick={() => setMode('standalone')}
                  className={cn(
                    'flex-1 cursor-pointer rounded-lg border-hairline px-3 py-2 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                    mode === 'standalone'
                      ? 'border-2 border-border-accent font-medium text-text-primary'
                      : 'border-border text-text-secondary',
                  )}
                >
                  Standalone
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'group'}
                  onClick={() => setMode('group')}
                  className={cn(
                    'flex-1 cursor-pointer rounded-lg border-hairline px-3 py-2 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                    mode === 'group'
                      ? 'border-2 border-border-accent font-medium text-text-primary'
                      : 'border-border text-text-secondary',
                  )}
                >
                  For a group
                </button>
              </div>
            )}

            {mode === 'standalone' ? (
              <div>
                <Label htmlFor="create-session-sport">Sport</Label>
                <Select
                  id="create-session-sport"
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
            ) : (
              <div>
                <Label htmlFor="create-session-group">Group</Label>
                <Select
                  id="create-session-group"
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(Number(event.target.value))}
                >
                  <option value="" disabled>
                    Select a group
                  </option>
                  {manageableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.groupName}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="create-session-title">Title (optional)</Label>
              <Input
                id="create-session-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Sunday pickup run"
              />
            </div>

            <div>
              <Label htmlFor="create-session-description">Description (optional)</Label>
              <textarea
                id="create-session-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="What's this session about?"
                className="w-full resize-none rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent"
              />
            </div>

            <div>
              {/* Not a <Label> — it doesn't associate with a form control, it introduces the
                  button/display pair below (same reasoning as jsx-a11y flagging an unassociated
                  <label>). */}
              <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                Location
              </span>
              {selectedLocation !== null && (
                <p className="mb-1.5 text-2sm text-text-primary">{selectedLocation.name}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={effectiveSportId === undefined}
                onClick={() => effectiveSportId !== undefined && onOpenLocationPicker(effectiveSportId)}
              >
                {selectedLocation === null ? 'Choose location' : 'Change location'}
              </Button>
              {effectiveSportId === undefined && (
                <p className="mt-1 text-2xs text-text-muted">Pick a sport or group first.</p>
              )}
            </div>

            <div>
              <Label htmlFor="create-session-location-note">Location note (optional)</Label>
              <Input
                id="create-session-location-note"
                value={locationNote}
                onChange={(event) => setLocationNote(event.target.value)}
                placeholder="e.g. Court 3"
              />
            </div>

            <div>
              <Label htmlFor="create-session-start">Starts at</Label>
              <Input
                id="create-session-start"
                type="datetime-local"
                value={scheduledStart}
                onChange={(event) => setScheduledStart(event.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="create-session-duration">Duration in minutes (optional)</Label>
              <Input
                id="create-session-duration"
                type="number"
                min={0}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                placeholder="e.g. 90"
              />
            </div>

            {isError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't create the session. Try again.
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
              {isSubmitting ? 'Creating…' : 'Create session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <LocationPicker {...locationPicker} />
    </>
  );
}
