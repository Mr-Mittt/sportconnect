import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { initialsFor } from '@/shared/lib/initialsFor';

interface ProfileHeaderPlaceholderProps {
  /** The caller's name from the login session (`authStore.user`), available before — and
   * regardless of whether — the full profile row (`GET /users/me`) resolves. */
  fullName: string;
}

/**
 * PROFILE-12: what `/profile` renders in `ProfileHeader`'s slot while `useMyProfile()` hasn't
 * produced data — still loading *or* failed, deliberately one state (no shimmer vs. error
 * distinction, no retry; decided at filing). Same card frame, cover band and avatar-plus-name
 * layout as `ProfileHeader`, so the page doesn't jump when the real header replaces it, but only
 * what the session already knows: the name and initials. Handle, region, bio and the "Edit
 * profile" button all need the profile row, so they are omitted rather than faked.
 */
export function ProfileHeaderPlaceholder({ fullName }: ProfileHeaderPlaceholderProps) {
  return (
    <div
      data-testid="profile-header-placeholder"
      className="border-hairline mb-3.5 overflow-hidden rounded-xl border-border bg-surface-2"
    >
      <div className="h-27.5 bg-surface-1" />
      <div className="flex items-end gap-3.5 px-3.5 pb-3">
        <Avatar className="-mt-6.5 size-16 shrink-0 border-3 border-surface-2">
          <AvatarFallback className="text-lg">{initialsFor(fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 pt-3">
          <div className="truncate text-base font-medium text-text-primary">{fullName}</div>
        </div>
      </div>
    </div>
  );
}
