import { useState } from 'react';
import type { Group, GroupInfo, GroupSettings, UpdateGroupSettingsPayload } from '@/features/feed/types';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

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

interface TextFieldRowProps {
  id: string;
  label: string;
  value: string;
  canEdit: boolean;
  isLoading: boolean;
  isError: boolean;
  emptyText: string;
  onChange: (value: string) => void;
}

/** One `GroupInfo` free-text row (rules/schedule) — draft-based, shares the Save button below. */
function TextFieldRow({ id, label, value, canEdit, isLoading, isError, emptyText, onChange }: TextFieldRowProps) {
  return (
    <div className="border-hairline-t border-border pt-3.5">
      <Label htmlFor={id}>{label}</Label>
      {isLoading ? (
        <p className="text-2sm text-text-muted">Loading…</p>
      ) : isError ? (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load
        </p>
      ) : canEdit ? (
        <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <p className="text-2sm text-text-secondary">{value !== '' ? value : emptyText}</p>
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
  /** GRP-2 (rules/schedule) — undefined while loading, per `useGroupGeneralData`. */
  groupInfo: GroupInfo | undefined;
  isGroupInfoLoading: boolean;
  isGroupInfoError: boolean;
  onUpdateGroupInfoField: (key: 'rules' | 'schedule', value: string) => void;
  /** True if either the Permission toggles or the General rules/schedule fields are dirty. */
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
 * Two collapsible sections, both default-expanded (no design reference for
 * this split — it's a GRP-2 request, not a mockup):
 * - **General** ("group properties"): group name/description (read-only
 *   display), Privacy, rules/schedule, and the read-only Group type row.
 *   Privacy applies immediately on click (GRP-1, unchanged); rules/schedule
 *   are draft-based and share the Save button below with Permission.
 * - **Permission** ("group settings"): the three `GroupSettings` toggles.
 *   Owner-only edit (B7's real `updateGroupSettings` gating — stricter than
 *   Privacy/rules/schedule's owner+admin `updateGroup`); admin and member
 *   see the current value as plain text.
 *
 * One shared Save button (visible to owner+admin — whoever can edit
 * *something* draft-based) covers both sections' pending edits; disabled
 * until `hasUnsavedSettingsChanges`. Leaving the tab/group/page with a
 * pending draft is guarded by the parent's `useSettingsUnsavedGuard`.
 *
 * Member: no Delete button. Admin: no Delete button. Owner: Delete Group
 * button at the very bottom (`DELETE /api/groups/{groupId}` is owner-only).
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
  groupInfo,
  isGroupInfoLoading,
  isGroupInfoError,
  onUpdateGroupInfoField,
  hasUnsavedSettingsChanges,
  onSaveSettings,
  isSavingSettings,
  isSaveSettingsError,
}: GroupSettingsTabProps) {
  const isOwner = currentUserRole === 'group_owner';
  const isAdmin = currentUserRole === 'group_admin';
  const canEdit = isOwner || isAdmin;

  const [isGeneralOpen, setIsGeneralOpen] = useState(true);
  const [isPermissionOpen, setIsPermissionOpen] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <Collapsible open={isGeneralOpen} onOpenChange={setIsGeneralOpen}>
        <CollapsibleTrigger>
          <span className="text-sm font-semibold text-text-primary">General</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
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

          <TextFieldRow
            id="group-rules"
            label="Rules"
            value={groupInfo?.rules ?? ''}
            canEdit={canEdit}
            isLoading={isGroupInfoLoading}
            isError={isGroupInfoError}
            emptyText="No rules set yet."
            onChange={(value) => onUpdateGroupInfoField('rules', value)}
          />

          <TextFieldRow
            id="group-schedule"
            label="Schedule"
            value={groupInfo?.schedule ?? ''}
            canEdit={canEdit}
            isLoading={isGroupInfoLoading}
            isError={isGroupInfoError}
            emptyText="No schedule set yet."
            onChange={(value) => onUpdateGroupInfoField('schedule', value)}
          />

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
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={isPermissionOpen} onOpenChange={setIsPermissionOpen}>
        <CollapsibleTrigger>
          <span className="text-sm font-semibold text-text-primary">Permission</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
          {isSettingsError ? (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't load permission settings.
            </p>
          ) : (
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
              {!isOwner && (
                <p className="-mt-2.5 text-2xs text-text-muted">Only the owner can change these.</p>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {canEdit && (
        <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
          {isSaveSettingsError ? (
            <p role="alert" className="text-2xs text-text-danger">
              Couldn't save changes. Try again.
            </p>
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onSaveSettings}
            disabled={!hasUnsavedSettingsChanges || isSavingSettings}
          >
            {isSavingSettings ? 'Saving…' : 'Save'}
          </Button>
        </div>
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
