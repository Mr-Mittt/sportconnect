import { useState } from 'react';
import {
  buildProfileUpdatePayload,
  toProfileEditDraft,
  type ProfileEditDraft,
  type UpdateProfilePayload,
} from '@/features/profile/profileEditDraft';
import { MAX_BIO_LENGTH, type UserResponse } from '@/features/profile/types';
import { cn } from '@/shared/lib/utils';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserResponse;
  onSave: (payload: UpdateProfilePayload) => void;
  isSaving: boolean;
  errorMessage: string | null;
}

/**
 * PROFILE-5's Edit Profile modal, opened from `ProfileHeader`'s "Edit
 * profile" button. Presentational and controlled, same shape as
 * `AddSportModal`/`CreateGroupModal`: the parent owns `useUpdateMyProfile()`
 * and passes `onSave`/`isSaving`/`errorMessage` down. `ProfilePage`
 * (`PROFILE-6`) doesn't exist yet, so nothing wires `isOpen`/the mutation to
 * a real trigger this ticket — that wiring, and resetting the mutation on
 * close per `CLIENT-MODAL-1`'s rule ("if the error prop comes from a
 * mutation, close must reset it"), is `PROFILE-6`'s job.
 *
 * Resets on every *open* via a changing `key` prop from the parent (same
 * reasoning as `AddSportModal`/`CreateGroupModal` — avoids a setState-in-
 * effect reset).
 *
 * Fields cover every non-sport-profile `UpdateProfileRequest` field —
 * widened at pickup (2026-08-27, user decision) from the original 8 to all
 * 14, since the extra 6 (`phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/
 * `weightKg`/`shoeSizeCm`) live on the exact same row/endpoint. See the
 * ticket doc's Delta for the full reasoning.
 */
export function EditProfileModal({
  isOpen,
  onClose,
  user,
  onSave,
  isSaving,
  errorMessage,
}: EditProfileModalProps) {
  const [draft, setDraft] = useState<ProfileEditDraft>(() => toProfileEditDraft(user));

  const set = <K extends keyof ProfileEditDraft>(key: K, value: ProfileEditDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const payload = buildProfileUpdatePayload(user, draft);
  const isDirty = Object.keys(payload).length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fixedHeight fixedHeightVh={72} className="max-w-[35rem]">
        <DialogHeader title="Edit profile" className="border-hairline-b border-border px-4 py-3" />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(payload);
          }}
        >
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
            <h4 className="text-2sm font-semibold text-text-secondary">Profile</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="edit-profile-first-name">First name</Label>
                <Input
                  id="edit-profile-first-name"
                  value={draft.firstName}
                  onChange={(event) => set('firstName', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="edit-profile-last-name">Last name</Label>
                <Input
                  id="edit-profile-last-name"
                  value={draft.lastName}
                  onChange={(event) => set('lastName', event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-profile-username">Username</Label>
              <Input
                id="edit-profile-username"
                value={draft.username}
                onChange={(event) => set('username', event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-profile-bio">Bio</Label>
              <Textarea
                id="edit-profile-bio"
                value={draft.bio}
                maxLength={MAX_BIO_LENGTH}
                onChange={(event) => set('bio', event.target.value.slice(0, MAX_BIO_LENGTH))}
              />
              <p className="mt-1 text-right text-2xs text-text-muted">
                {draft.bio.length}/{MAX_BIO_LENGTH}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="edit-profile-city">City</Label>
                <Input
                  id="edit-profile-city"
                  value={draft.city}
                  onChange={(event) => set('city', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="edit-profile-country">Country</Label>
                <Input
                  id="edit-profile-country"
                  value={draft.country}
                  onChange={(event) => set('country', event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-profile-avatar-url">Avatar URL</Label>
              <Input
                id="edit-profile-avatar-url"
                value={draft.avatarUrl}
                onChange={(event) => set('avatarUrl', event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-profile-cover-url">Cover URL</Label>
              <Input
                id="edit-profile-cover-url"
                value={draft.coverUrl}
                onChange={(event) => set('coverUrl', event.target.value)}
              />
            </div>

            <h4 className="mt-1 text-2sm font-semibold text-text-secondary">Contact</h4>
            <div>
              <Label htmlFor="edit-profile-phone-number">Phone number</Label>
              <Input
                id="edit-profile-phone-number"
                value={draft.phoneNumber}
                maxLength={20}
                onChange={(event) => set('phoneNumber', event.target.value)}
              />
            </div>

            <h4 className="mt-1 text-2sm font-semibold text-text-secondary">Personal</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="edit-profile-date-of-birth">Date of birth</Label>
                <Input
                  id="edit-profile-date-of-birth"
                  type="date"
                  value={draft.dateOfBirth}
                  onChange={(event) => set('dateOfBirth', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="edit-profile-gender">Gender</Label>
                <Input
                  id="edit-profile-gender"
                  value={draft.gender}
                  onChange={(event) => set('gender', event.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="edit-profile-height">Height (cm)</Label>
                <Input
                  id="edit-profile-height"
                  type="number"
                  min={50}
                  max={300}
                  value={draft.heightCm}
                  onChange={(event) => set('heightCm', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="edit-profile-weight">Weight (kg)</Label>
                <Input
                  id="edit-profile-weight"
                  type="number"
                  min={20}
                  max={300}
                  value={draft.weightKg}
                  onChange={(event) => set('weightKg', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="edit-profile-shoe-size">Shoe size (JP, cm)</Label>
                <Input
                  id="edit-profile-shoe-size"
                  type="number"
                  min={10}
                  max={500}
                  value={draft.shoeSizeCm}
                  onChange={(event) => set('shoeSizeCm', event.target.value)}
                />
              </div>
            </div>

            {errorMessage !== null && (
              <p role="alert" className="text-2sm text-text-danger">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="border-hairline-t flex justify-end border-border px-4 py-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSaving}
              className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
