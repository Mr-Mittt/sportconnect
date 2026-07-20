import type { Group } from '@/features/feed/types';
import { Button } from '@/shared/ui/button';

interface GroupSettingsTabProps {
  group: Group;
  /** `Group.currentUserRole` — `'group_owner' | 'group_admin' | 'group_member' | null`. */
  currentUserRole: string | null;
  onUpdatePrivacy: (isPrivate: boolean) => void;
  isUpdatingPrivacy: boolean;
  isUpdatePrivacyError: boolean;
  onLeave: () => void;
  isLeaving: boolean;
  isLeaveError: boolean;
  onRequestDelete: () => void;
}

/**
 * Settings tab (`design-reference-group-feed.html`'s Settings, extended per
 * GRP-1's decided scope — see `client/docs/BACKLOG_MVP.md`). Deliberately
 * narrower than the reference: only Privacy, Leave, and Delete are wired —
 * the `GroupSettings` toggle fields (`allowMemberPosts`/etc.) and the
 * Notifications toggle are out of scope here (GRP-2, blocked on B7).
 *
 * Gating (matches the real backend, not the reference — which shows no
 * gating at all):
 * - Member: everything read-only, no Delete button.
 * - Admin: can edit Privacy (`PUT /api/groups/{groupId}` is owner/admin), no
 *   Delete button.
 * - Owner: can edit Privacy, Delete Group button at the very bottom
 *   (`DELETE /api/groups/{groupId}` is owner-only).
 * Leave Group is available to any non-owner member; the owner must transfer
 * ownership first (existing backend rule) — disabled with an explanatory
 * note here rather than letting it 400.
 */
export function GroupSettingsTab({
  group,
  currentUserRole,
  onUpdatePrivacy,
  isUpdatingPrivacy,
  isUpdatePrivacyError,
  onLeave,
  isLeaving,
  isLeaveError,
  onRequestDelete,
}: GroupSettingsTabProps) {
  const isOwner = currentUserRole === 'group_owner';
  const isAdmin = currentUserRole === 'group_admin';
  const canEdit = isOwner || isAdmin;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium text-text-primary">{group.groupName}</div>
        {group.description !== null && group.description !== '' && (
          <p className="mt-1 text-2sm text-text-secondary">{group.description}</p>
        )}
      </div>

      <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
        <div>
          <div className="text-2sm font-medium text-text-primary">Privacy</div>
          <div className="text-2xs text-text-muted">Who can see and join this group</div>
        </div>
        {canEdit ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onUpdatePrivacy(false)}
              disabled={isUpdatingPrivacy}
              aria-pressed={!group.isPrivate}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent ${
                !group.isPrivate
                  ? 'border-2 border-border-accent font-medium text-text-primary'
                  : 'border-hairline border-border bg-surface-1 text-text-secondary'
              }`}
            >
              Public
            </button>
            <button
              type="button"
              onClick={() => onUpdatePrivacy(true)}
              disabled={isUpdatingPrivacy}
              aria-pressed={group.isPrivate}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent ${
                group.isPrivate
                  ? 'border-2 border-border-accent font-medium text-text-primary'
                  : 'border-hairline border-border bg-surface-1 text-text-secondary'
              }`}
            >
              Private
            </button>
          </div>
        ) : (
          <span className="text-2sm text-text-secondary">{group.isPrivate ? 'Private' : 'Public'}</span>
        )}
      </div>
      {isUpdatePrivacyError && (
        <p role="alert" className="-mt-2.5 text-2xs text-text-danger">
          Couldn't update privacy. Try again.
        </p>
      )}
      {!canEdit && (
        <p className="-mt-2.5 text-2xs text-text-muted">Only the owner and admins can change this.</p>
      )}

      <div className="border-hairline-t border-border pt-3.5">
        <Button variant="outline" size="sm" onClick={onLeave} disabled={isOwner || isLeaving}>
          {isLeaving ? 'Leaving…' : 'Leave Group'}
        </Button>
        {isOwner && (
          <p className="mt-1.5 text-2xs text-text-muted">
            Transfer ownership to another member before you can leave.
          </p>
        )}
        {isLeaveError && (
          <p role="alert" className="mt-1.5 text-2xs text-text-danger">
            Couldn't leave the group. Try again.
          </p>
        )}
      </div>

      {isOwner && (
        <div className="border-hairline-t border-border pt-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRequestDelete}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            Delete Group
          </Button>
        </div>
      )}
    </div>
  );
}
