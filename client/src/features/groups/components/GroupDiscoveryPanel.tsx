import { IconPlus, IconSearch, IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { Group, GroupInvitation } from '@/features/feed/types';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupInvitationsSection } from './GroupInvitationsSection';

interface GroupDiscoveryPanelProps {
  /** Already sport-filtered by the caller (same `data.groups` GroupSpaceSwitcher
   * uses) — a group is 1:1 with a sport, so this list matches whatever the
   * sport switcher currently shows. */
  groups: Group[];
  sportsByKey: Record<SportKey, SportProfile>;
  onOpenGroup: (groupId: number, sportId: number) => void;
  /** Whatever's currently typed into the shared "Group name or invite code"
   * input, trimmed — CreateGroupModal pre-fills its name field with this. */
  onCreateGroup: (query: string) => void;
  /** Same typed value — JoinGroupModal opens pre-filled and, if non-empty,
   * with a search already in flight (see `useJoinGroupModalData.openSearch`). */
  onJoinGroup: (query: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** GRP-7: the current user's own pending_user invitations across every
   * group — rendered above the joined-groups grid, hidden entirely when
   * empty. */
  invitations: GroupInvitation[];
  isInvitationsLoading: boolean;
  isInvitationsError: boolean;
  onRetryInvitations: () => void;
  onAcceptInvitation: (invitationId: number) => void;
  onRejectInvitation: (invitationId: number) => void;
  isAcceptingInvitation: boolean;
  isRejectingInvitation: boolean;
}

function initialsFor(groupName: string): string {
  return groupName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * `group-main`'s "All groups" state (`design-reference-group-feed.html`) —
 * renders in place of the tabbed per-group view whenever no group is
 * selected. GRP-7's "Invitations" section (`GroupInvitationsSection`) sits
 * above everything else, hidden entirely when empty. A shared "Group name or
 * invite code" input feeds both the Join/Create buttons (whichever fires
 * reads the current text — matches the reference's `group-action-input`),
 * then a card grid of the user's joined groups (sport-filtered) below,
 * matching the reference exactly.
 *
 * The card grid necessarily shows the same groups as `GroupSpaceSwitcher`'s
 * pill row above it — that's the reference's actual design, not an
 * oversight. To keep the two controls distinguishable (an earlier version of
 * this panel caused a real bug: `getByRole('button', { name: /GroupName/ })`
 * matched two elements, since both rendered the bare group name), each
 * card's accessible name is `Open {groupName}` rather than the bare name —
 * visually the two also read differently (compact pill vs. a richer card
 * with avatar + member count), so this isn't just an aria Band-Aid.
 */
export function GroupDiscoveryPanel({
  groups,
  sportsByKey,
  onOpenGroup,
  onCreateGroup,
  onJoinGroup,
  isLoading,
  isError,
  onRetry,
  invitations,
  isInvitationsLoading,
  isInvitationsError,
  onRetryInvitations,
  onAcceptInvitation,
  onRejectInvitation,
  isAcceptingInvitation,
  isRejectingInvitation,
}: GroupDiscoveryPanelProps) {
  // Transient UI input, same "component owns its own input state" precedent
  // as CreatePostForm's textarea — read at click time by whichever button
  // fires, matching the design reference's single shared input.
  const [query, setQuery] = useState('');

  return (
    <div className="border-hairline flex flex-col gap-3.5 rounded-xl border-border bg-surface-1 p-3.5">
      <GroupInvitationsSection
        invitations={invitations}
        isLoading={isInvitationsLoading}
        isError={isInvitationsError}
        onRetry={onRetryInvitations}
        onAccept={onAcceptInvitation}
        onReject={onRejectInvitation}
        isAccepting={isAcceptingInvitation}
        isRejecting={isRejectingInvitation}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Group name or invite code"
          aria-label="Group name or invite code"
          className="w-auto min-w-0 flex-1 sm:max-w-64"
        />
        <button
          type="button"
          onClick={() => onJoinGroup(query.trim())}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-hairline border-border-strong bg-surface-2 px-3 py-1.75 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconSearch className="size-4" aria-hidden="true" />
          Join Group
        </button>
        <button
          type="button"
          onClick={() => onCreateGroup(query.trim())}
          className="border-hairline flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-dashed border-border-strong bg-surface-2 px-3 py-1.75 text-2sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconPlus className="size-4" aria-hidden="true" />
          Create Group
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-16.5 w-full rounded-xl" />
          <Skeleton className="h-16.5 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center gap-2 py-4">
          <p className="text-2sm text-text-danger">Couldn't load your groups.</p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-lg border-hairline border-border px-2.5 py-1 text-2sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <IconUsersGroup className="size-6 text-text-muted" aria-hidden="true" />
          <p className="text-2sm text-text-muted">You haven't joined any groups yet.</p>
        </div>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {groups.map((group) => {
            const sportKey = sportKeyForId(group.sportId);
            const ramp = sportKey !== undefined ? sportsByKey[sportKey]?.colorRamp : undefined;
            return (
              <button
                key={group.id}
                type="button"
                aria-label={`Open ${group.groupName}`}
                onClick={() => onOpenGroup(group.id, group.sportId)}
                className="border-hairline flex min-h-16.5 cursor-pointer items-center gap-3 rounded-xl border-border bg-surface-2 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                {/* Radix's AvatarImage only mounts its <img> once a real
                    image-load event fires — jsdom never fires one, so this
                    path (unlike GroupCoverBanner's plain <img>) isn't
                    meaningfully unit-testable; verified by direct render/
                    inspection instead. AvatarFallback covers the null and
                    broken-image cases either way. */}
                <Avatar className="size-11 shrink-0">
                  {group.coverUrl !== null && <AvatarImage src={group.coverUrl} alt="" />}
                  <AvatarFallback
                    className={`text-sm font-medium ${getRampBadgeClasses(ramp ?? '')}`}
                  >
                    {initialsFor(group.groupName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">{group.groupName}</div>
                  <div className="text-2xs text-text-muted">{group.memberCount} members</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
