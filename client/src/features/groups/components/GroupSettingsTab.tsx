import { useState } from 'react';
import type { Group, GroupInfo, GroupSettings, UpdateGroupSettingsPayload } from '@/features/feed/types';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Label } from '@/shared/ui/label';
import { isGroupManager } from '@/shared/lib/groupRole';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleFieldRow } from './ToggleFieldRow';
import { ChoiceDialog } from '../sessionConfig/components/ChoiceDialog';
import { GroupSessionsConfigSection } from '../sessionConfig/components/GroupSessionsConfigSection';
import type { GroupSessionsConfigData } from '../sessionConfig/useGroupSessionsConfigData';

interface TextFieldRowProps {
  id: string;
  label: string;
  value: string;
  canEdit: boolean;
  isLoading: boolean;
  isError: boolean;
  emptyText: string;
  onChange: (value: string) => void;
  /** Fired when the field loses focus: the caller saves the draft. */
  onBlur: () => void;
  /** The failure of this field's last save; absent when there is none. */
  errorText?: string;
  t: ReturnType<typeof useOverridableText>;
}

/** One `GroupInfo` free-text row (rules/schedule): typing is a draft, leaving the field saves it (CLIENT-GROUP-SESSION-4), a failure shows under the field. */
function TextFieldRow({
  id,
  label,
  value,
  canEdit,
  isLoading,
  isError,
  emptyText,
  onChange,
  onBlur,
  errorText,
  t,
}: TextFieldRowProps) {
  return (
    <div className="border-hairline-t border-border pt-3.5">
      <Label htmlFor={id}>{label}</Label>
      {isLoading ? (
        <p className="text-2sm text-text-muted">{t('settings.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-2sm text-text-danger">
          {t('settings.loadError')}
        </p>
      ) : canEdit ? (
        <>
          <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
          {errorText !== undefined && (
            <p role="alert" className="mt-1 text-2xs text-text-danger">
              {errorText}
            </p>
          )}
        </>
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
  /** CLIENT-ERR-5: the specific localized line for a coded failure; each falls back to its static line. */
  privacyErrorText?: string;
  onLeave: () => void;
  isLeaving: boolean;
  isLeaveError: boolean;
  leaveErrorText?: string;
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
  /** Leaving a rules/schedule field saves it (CLIENT-GROUP-SESSION-4); `groupInfoFieldError` is the last failed one, shown under that field. */
  onCommitGroupInfoField: (key: 'rules' | 'schedule') => void;
  groupInfoFieldError: { key: 'rules' | 'schedule'; text?: string } | null;
  /** True while a Permission toggle is dirty (owner only): the Save button of the Permission section. */
  hasUnsavedPermissionChanges: boolean;
  onSavePermission: () => void;
  isSavingPermission: boolean;
  isSavePermissionError: boolean;
  savePermissionErrorText?: string;
  /** CLIENT-GROUP-SESSION-4: the Sessions section's data and actions. */
  sessionsConfig: GroupSessionsConfigData;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * Settings tab (`design-reference-group-feed.html`'s Settings, extended per
 * GRP-1's decided scope, then GRP-2 — see `client/docs/BACKLOG_MVP.md`).
 * The Notifications toggle shown in the reference has no backing endpoint
 * anywhere and stays out of scope.
 *
 * Three collapsible sections, all collapsed by default (CLIENT-GROUP-SESSION-4; no design
 * reference for this split — it's a GRP-2 request, not a mockup):
 * - **General** ("group properties"): group name/description (read-only
 *   display), Privacy, rules/schedule, and the read-only Group type row.
 *   Privacy applies immediately on click (GRP-1, unchanged); rules/schedule
 *   are typed as a draft and saved when the field loses focus (CLIENT-GROUP-SESSION-4;
 *   a failed save keeps the draft and shows under the field).
 * - **Permission** ("group settings"): the three `GroupSettings` toggles.
 *   Owner-only edit (B7's real `updateGroupSettings` gating — stricter than
 *   Privacy/rules/schedule's owner+admin `updateGroup`); admin and member
 *   see the current value as plain text.
 *
 * - **Sessions** (CLIENT-GROUP-SESSION-4): regular-session generation, its
 *   recurrence mode and the configurations; each action saves at once.
 *
 * The Permission section has its own Save button (owner only, since only the
 * owner edits the toggles), disabled until a toggle is dirty. Leaving the
 * tab/group/page with a pending draft (a toggle, or a rules/schedule save that
 * failed) is guarded by the parent's `useSettingsUnsavedGuard`. Leave Group asks
 * for confirmation first.
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
  privacyErrorText,
  onLeave,
  isLeaving,
  isLeaveError,
  leaveErrorText,
  onRequestDelete,
  groupSettings,
  isSettingsLoading,
  isSettingsError,
  onUpdateSetting,
  groupInfo,
  isGroupInfoLoading,
  isGroupInfoError,
  onUpdateGroupInfoField,
  onCommitGroupInfoField,
  groupInfoFieldError,
  hasUnsavedPermissionChanges,
  onSavePermission,
  isSavingPermission,
  isSavePermissionError,
  savePermissionErrorText,
  sessionsConfig,
  i18nOverridePrefix,
}: GroupSettingsTabProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const isOwner = currentUserRole === 'group_owner';
  const canEdit = isGroupManager(currentUserRole);

  // Every section starts collapsed (owner, 2026-11-20, CLIENT-GROUP-SESSION-4).
  const [isGeneralOpen, setIsGeneralOpen] = useState(false);
  const [isPermissionOpen, setIsPermissionOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Collapsible open={isGeneralOpen} onOpenChange={setIsGeneralOpen}>
        <CollapsibleTrigger>
          <span className="text-sm font-semibold text-text-primary">{t('settings.general')}</span>
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
              <div className="text-2sm font-medium text-text-primary">{t('settings.privacy')}</div>
              <div className="text-2xs text-text-muted">{t('settings.privacyDesc')}</div>
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
                  {t('settings.public')}
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
                  {t('settings.private')}
                </button>
              </div>
            ) : (
              <span className="text-2sm text-text-secondary">{group.isPrivate ? t('settings.private') : t('settings.public')}</span>
            )}
          </div>
          {isUpdatePrivacyError && (
            <p role="alert" className="-mt-2.5 text-2xs text-text-danger">
              {privacyErrorText ?? t('settings.privacyError')}
            </p>
          )}
          {!canEdit && (
            <p className="-mt-2.5 text-2xs text-text-muted">{t('settings.ownerAdminOnly')}</p>
          )}

          <TextFieldRow
            t={t}
            id="group-rules"
            label={t('settings.rules')}
            value={groupInfo?.rules ?? ''}
            canEdit={canEdit}
            isLoading={isGroupInfoLoading}
            isError={isGroupInfoError}
            emptyText={t('settings.rulesEmpty')}
            onChange={(value) => onUpdateGroupInfoField('rules', value)}
            onBlur={() => onCommitGroupInfoField('rules')}
            errorText={groupInfoFieldError?.key === 'rules' ? (groupInfoFieldError.text ?? t('settings.saveError')) : undefined}
          />

          <TextFieldRow
            t={t}
            id="group-schedule"
            label={t('settings.schedule')}
            value={groupInfo?.schedule ?? ''}
            canEdit={canEdit}
            isLoading={isGroupInfoLoading}
            isError={isGroupInfoError}
            emptyText={t('settings.scheduleEmpty')}
            onChange={(value) => onUpdateGroupInfoField('schedule', value)}
            onBlur={() => onCommitGroupInfoField('schedule')}
            errorText={groupInfoFieldError?.key === 'schedule' ? (groupInfoFieldError.text ?? t('settings.saveError')) : undefined}
          />

          <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
            <div>
              <div className="text-2sm font-medium text-text-primary">{t('settings.groupType')}</div>
              <div className="text-2xs text-text-muted">{t('settings.groupTypeDesc')}</div>
            </div>
            {isSettingsLoading ? (
              <span className="text-2sm text-text-muted">{t('settings.loading')}</span>
            ) : isSettingsError ? (
              <span role="alert" className="text-2sm text-text-danger">
                {t('settings.loadError')}
              </span>
            ) : (
              <span className="text-2sm text-text-secondary">{groupSettings?.groupTypeName}</span>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={isPermissionOpen} onOpenChange={setIsPermissionOpen}>
        <CollapsibleTrigger>
          <span className="text-sm font-semibold text-text-primary">{t('settings.permission')}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
          {isSettingsError ? (
            <p role="alert" className="text-2sm text-text-danger">
              {t('settings.permissionLoadError')}
            </p>
          ) : (
            <>
              <ToggleFieldRow
                t={t}
                label={t('settings.allowPosts')}
                description={t('settings.allowPostsDesc')}
                value={groupSettings?.allowMemberPosts ?? false}
                canEdit={isOwner}
                onChange={(value) => onUpdateSetting('allowMemberPosts', value)}
              />
              <ToggleFieldRow
                t={t}
                label={t('settings.requireApproval')}
                description={t('settings.requireApprovalDesc')}
                value={groupSettings?.requirePostApproval ?? false}
                canEdit={isOwner}
                onChange={(value) => onUpdateSetting('requirePostApproval', value)}
              />
              <ToggleFieldRow
                t={t}
                label={t('settings.allowInvites')}
                description={t('settings.allowInvitesDesc')}
                value={groupSettings?.allowMemberInvites ?? false}
                canEdit={isOwner}
                onChange={(value) => onUpdateSetting('allowMemberInvites', value)}
              />
              {!isOwner && (
                <p className="-mt-2.5 text-2xs text-text-muted">{t('settings.ownerOnly')}</p>
              )}
              {isOwner && (
                <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
                  {isSavePermissionError ? (
                    <p role="alert" className="text-2xs text-text-danger">
                      {savePermissionErrorText ?? t('settings.saveError')}
                    </p>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onSavePermission}
                    disabled={!hasUnsavedPermissionChanges || isSavingPermission}
                  >
                    {isSavingPermission ? t('settings.saving') : t('settings.save')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={isSessionsOpen} onOpenChange={setIsSessionsOpen}>
        <CollapsibleTrigger>
          <span className="text-sm font-semibold text-text-primary">{t('settings.sessions.title')}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
          <GroupSessionsConfigSection canEdit={canEdit} data={sessionsConfig} groupName={group.groupName} i18nOverridePrefix={i18nOverridePrefix} />
        </CollapsibleContent>
      </Collapsible>

      <div className="border-hairline-t border-border pt-3.5">
        <Button variant="outline" size="sm" onClick={() => setIsLeaveConfirmOpen(true)} disabled={isOwner || isLeaving}>
          {isLeaving ? t('settings.leaving') : t('settings.leave')}
        </Button>
        {isOwner && (
          <p className="mt-1.5 text-2xs text-text-muted">
            {t('settings.transferOwnership')}
          </p>
        )}
        {isLeaveError && (
          <p role="alert" className="mt-1.5 text-2xs text-text-danger">
            {leaveErrorText ?? t('settings.leaveError')}
          </p>
        )}
      </div>

      <ChoiceDialog
        isOpen={isLeaveConfirmOpen}
        title={t('settings.leaveDialog.title')}
        body={t('settings.leaveDialog.body')}
        onClose={() => setIsLeaveConfirmOpen(false)}
        choices={[
          { key: 'stay', label: t('settings.leaveDialog.stay'), variant: 'outline', onSelect: () => setIsLeaveConfirmOpen(false) },
          {
            key: 'leave',
            label: t('settings.leaveDialog.confirm'),
            variant: 'danger',
            onSelect: () => {
              setIsLeaveConfirmOpen(false);
              onLeave();
            },
          },
        ]}
      />

      {isOwner && (
        <div className="border-hairline-t border-border pt-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRequestDelete}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {t('settings.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}
