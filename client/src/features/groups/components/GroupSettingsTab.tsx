import type { Group, GroupSettings, UpdateGroupSettingsPayload } from '@/features/feed/types';
import { Button } from '@/shared/ui/button';

interface ToggleFieldRowProps {
  label: string;
  description: string;
  value: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}

/** One `GroupSettings` boolean row — same visual shape as the Privacy row below. */
function ToggleFieldRow({ label, description, value, canEdit, onChange }: ToggleFieldRowProps) {
  return (
    <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
      <div>
        <div className="text-2sm font-medium text-text-primary">{label}</div>
        <div className="text-2xs text-text-muted">{description}</div>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={value}
          aria-label={`${label}: ${value ? 'On' : 'Off'}`}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent ${
            value
              ? 'border-2 border-border-accent font-medium text-text-primary'
              : 'border-hairline border-border bg-surface-1 text-text-secondary'
          }`}
        >
          {value ? 'On' : 'Off'}
        </button>
      ) : (
        <span className="text-2sm text-text-secondary">{value ? 'On' : 'Off'}</span>
      )}
    </div>
  );
}

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
  /** GRP-2 — undefined while loading, per `useGroupSettings`. */
  groupSettings: GroupSettings | undefined;
  isSettingsLoading: boolean;
  isSettingsError: boolean;
  onUpdateSetting: <K extends keyof UpdateGroupSettingsPayload>(
    key: K,
    value: UpdateGroupSettingsPayload[K],
  ) => void;
  hasUnsavedSettingsChanges: boolean;
  onSaveSettings: () => void;
  isSavingSettings: boolean;
  isSaveSettingsError: boolean;
}

/**
 * Settings tab (`design-reference-group-feed.html`'s Settings, extended per
 * GRP-1's decided scope, then GRP-2 — see `client/docs/BACKLOG_MVP.md`).
 * The Notifications toggle shown in the reference has no backing endpoint
 * anywhere and stays out of scope.
 *
 * Gating (matches the real backend, not the reference — which shows no
 * gating at all):
 * - Privacy (`updateGroup`) — owner+admin edit, member read-only. Applies
 *   immediately on click, no draft/Save (GRP-1, unchanged by GRP-2).
 * - The three `GroupSettings` toggles below (`updateGroupSettings`, B7) —
 *   **owner-only** edit; admin and member see the current value as plain
 *   text. Draft-based: edits stage locally, a Save button (disabled until
 *   something changed) persists them. Leaving the tab/group/page with a
 *   pending draft is guarded by the parent's `useSettingsUnsavedGuard`.
 * - Group type (read-only, all roles) — no cap number shown; changing type
 *   isn't built yet (B10).
 * - Member: no Delete button. Admin: no Delete button. Owner: Delete Group
 *   button at the very bottom (`DELETE /api/groups/{groupId}` is owner-only).
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
  groupSettings,
  isSettingsLoading,
  isSettingsError,
  onUpdateSetting,
  hasUnsavedSettingsChanges,
  onSaveSettings,
  isSavingSettings,
  isSaveSettingsError,
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

      <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
        <div>
          <div className="text-2sm font-medium text-text-primary">Group type</div>
          <div className="text-2xs text-text-muted">Determines this group's member cap</div>
        </div>
        {isSettingsLoading ? (
          <span className="text-2sm text-text-muted">Loading…</span>
        ) : isSettingsError ? (
          <span role="alert" className="text-2sm text-text-danger">
            Couldn't load
          </span>
        ) : (
          <span className="text-2sm text-text-secondary">{groupSettings?.groupTypeName}</span>
        )}
      </div>

      {isSettingsError ? null : (
        <>
          <ToggleFieldRow
            label="Allow member posts"
            description="Members can post in this group"
            value={groupSettings?.allowMemberPosts ?? false}
            canEdit={isOwner}
            onChange={(value) => onUpdateSetting('allowMemberPosts', value)}
          />
          <ToggleFieldRow
            label="Require post approval"
            description="Owner/admin must approve member posts before they're visible"
            value={groupSettings?.requirePostApproval ?? false}
            canEdit={isOwner}
            onChange={(value) => onUpdateSetting('requirePostApproval', value)}
          />
          <ToggleFieldRow
            label="Allow member invites"
            description="Members can invite friends to join this group"
            value={groupSettings?.allowMemberInvites ?? false}
            canEdit={isOwner}
            onChange={(value) => onUpdateSetting('allowMemberInvites', value)}
          />
          {isOwner ? (
            <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
              {isSaveSettingsError ? (
                <p role="alert" className="text-2xs text-text-danger">
                  Couldn't save settings. Try again.
                </p>
              ) : (
                <span />
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={onSaveSettings}
                disabled={!hasUnsavedSettingsChanges || isSavingSettings || isSettingsLoading}
              >
                {isSavingSettings ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <p className="-mt-2.5 text-2xs text-text-muted">Only the owner can change these.</p>
          )}
        </>
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
