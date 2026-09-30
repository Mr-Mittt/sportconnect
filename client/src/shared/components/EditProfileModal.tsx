import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildProfileUpdatePayload,
  toProfileEditDraft,
  type ProfileEditDraft,
  type UpdateProfilePayload,
} from '@/features/profile/profileEditDraft';
import type { UserResponse } from '@/features/profile/types';
import { cn } from '@/shared/lib/utils';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserResponse;
  onSave: (payload: UpdateProfilePayload) => void;
  isSaving: boolean;
  errorMessage: string | null;
}

/**
 * PROFILE-5's Edit Profile modal, opened from `ProfileHeader`'s "Edit profile" button.
 * Presentational and controlled, same shape as `AddSportModal`/`CreateGroupModal`: the parent owns
 * `useUpdateMyProfile()` and passes `onSave`/`isSaving`/`errorMessage` down. Resets on every
 * *open* via a changing `key` prop from the parent (avoids a setState-in-effect reset).
 *
 * **ACCOUNT-1:** narrowed to the two "how my profile looks" fields — avatar URL and cover URL.
 * Everything else it used to edit (name, username, bio, country/region/language, contact,
 * personal stats) moved to `AccountSettingsModal`, opened from `TopBar`'s avatar dropdown. It
 * still shares `ProfileEditDraft`/`buildProfileUpdatePayload` with that modal, so a save here
 * only ever contains fields this modal exposes (the rest of the draft can't differ from the
 * server row).
 */
export function EditProfileModal({
  isOpen,
  onClose,
  user,
  onSave,
  isSaving,
  errorMessage,
}: EditProfileModalProps) {
  const { t } = useTranslation('profile');
  const [draft, setDraft] = useState<ProfileEditDraft>(() => toProfileEditDraft(user));

  const set = <K extends keyof ProfileEditDraft>(key: K, value: ProfileEditDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const payload = buildProfileUpdatePayload(user, draft);
  const isDirty = Object.keys(payload).length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader title={t('title')} className="border-hairline-b border-border px-4 py-3" />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(payload);
          }}
        >
          <div className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
            <div>
              <Label htmlFor="edit-profile-avatar-url">{t('field.avatarUrl')}</Label>
              <Input
                id="edit-profile-avatar-url"
                value={draft.avatarUrl}
                onChange={(event) => set('avatarUrl', event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-profile-cover-url">{t('field.coverUrl')}</Label>
              <Input
                id="edit-profile-cover-url"
                value={draft.coverUrl}
                onChange={(event) => set('coverUrl', event.target.value)}
              />
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
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
