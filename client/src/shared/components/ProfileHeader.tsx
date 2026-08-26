import { IconPencil } from '@tabler/icons-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import type { UserResponse } from '@/features/profile/types';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ProfileHeaderProps {
  user: UserResponse;
  /** Opens PROFILE-5's Edit Profile modal — a no-op placeholder until that
   * ticket lands, same "wire the destination doesn't exist yet" pattern as
   * HF-3/HF-4. */
  onEditProfile: () => void;
}

/**
 * `/profile` page's cover-banner card (`design-reference-profile.html`'s
 * `#profile-header`). Presentational and controlled — `ProfilePage`
 * (PROFILE-6) owns fetching `user` via `useMyProfile()` and wiring
 * `onEditProfile` once PROFILE-5 exists. The `SportSwitcher` above this card
 * and the rail tabs below it are PROFILE-6's job, not this component's.
 *
 * Cover/avatar fall back the same way `GroupCoverBanner`/`FriendProfilePanel`
 * already do — a plain `surface-1` band, `coverUrl` overlaid as an image when
 * set, no decorative pattern (this app has no such treatment anywhere else).
 * `username`/`city` each render only when non-null, and the whole handle
 * line is omitted if both are null — same "no placeholder for missing
 * optional text" rule the design spec gives `bio`.
 */
export function ProfileHeader({ user, onEditProfile }: ProfileHeaderProps) {
  const handleParts = [user.username !== null ? `@${user.username}` : null, user.city].filter(
    (part): part is string => part !== null,
  );

  return (
    <div className="border-hairline mb-3.5 overflow-hidden rounded-xl border-border bg-surface-2">
      <div className="relative h-27.5 bg-surface-1">
        {user.coverUrl !== null && (
          <img src={user.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className="flex items-end justify-between gap-3.5 px-3.5 pb-3">
        <div className="flex min-w-0 items-end gap-3.5">
          <Avatar className="-mt-6.5 size-16 shrink-0 border-3 border-surface-2">
            {user.avatarUrl !== null && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="text-lg">{initialsFor(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 pt-3">
            <div className="truncate text-base font-medium text-text-primary">{user.fullName}</div>
            {handleParts.length > 0 && (
              <div className="truncate text-2sm text-text-muted">{handleParts.join(' · ')}</div>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditProfile} className="shrink-0">
          <IconPencil className="size-4" aria-hidden="true" />
          Edit profile
        </Button>
      </div>
      {user.bio !== null && user.bio !== '' && (
        <div className="px-3.5 pb-3.5">
          <p className="max-w-150 text-2sm text-text-primary">{user.bio}</p>
        </div>
      )}
    </div>
  );
}
