import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import type { GroupInvitation, GroupMember, JoinRequest } from '@/features/feed/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function matchesQuery(name: string, query: string): boolean {
  return query === '' || name.toLowerCase().includes(query.toLowerCase());
}

interface MemberRowProps {
  avatarUrl: string | null;
  name: string;
  subtitle?: string;
  action?: React.ReactNode;
  isCurrentUser?: boolean;
}

function MemberRow({ avatarUrl, name, subtitle, action, isCurrentUser = false }: MemberRowProps) {
  return (
    <div className="border-hairline flex items-center justify-between gap-3 rounded-lg border-border p-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-8 shrink-0">
          {avatarUrl !== null && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
            {initialsFor(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-2sm font-medium text-text-primary">
            {name}
            {isCurrentUser && <span className="font-normal text-text-muted"> (you)</span>}
          </div>
          {subtitle !== undefined && <div className="text-2xs text-text-muted">{subtitle}</div>}
        </div>
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface SectionProps {
  title: string;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  totalCount: number;
  filteredCount: number;
  children: React.ReactNode;
}

function Section({ title, isLoading, isError, onRetry, totalCount, filteredCount, children }: SectionProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-2sm font-semibold text-text-primary">{title}</h3>
      {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {isError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-2sm text-text-danger">
            Couldn't load.
          </p>
          {onRetry !== undefined && (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer rounded-lg border-hairline border-border px-2.5 py-1 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {!isLoading && !isError && totalCount === 0 && (
        <p className="text-2sm text-text-muted">Nothing here yet.</p>
      )}
      {!isLoading && !isError && totalCount > 0 && filteredCount === 0 && (
        <p className="text-2sm text-text-muted">No matches.</p>
      )}
      {!isLoading && !isError && filteredCount > 0 && (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}

function invitationStatusLabel(invitation: GroupInvitation): string {
  if (invitation.status === 'pending_owner') return 'Awaiting owner approval';
  const firstName = invitation.inviteeFullName.split(' ')[0] ?? invitation.inviteeFullName;
  return `Awaiting ${firstName}'s response`;
}

interface GroupMembersTabProps {
  canManage: boolean;
  /** The signed-in user's id — flags their own row with "(you)" in the
   * Group administrator/Members lists. */
  currentUserId: string | undefined;
  joinRequests: JoinRequest[];
  isJoinRequestsLoading: boolean;
  isJoinRequestsError: boolean;
  onRetryJoinRequests: () => void;
  onAcceptJoinRequest: (requestId: number) => void;
  onDeclineJoinRequest: (requestId: number) => void;
  isAcceptingJoinRequest: boolean;
  isDecliningJoinRequest: boolean;
  sentInvitations: GroupInvitation[];
  isSentInvitationsLoading: boolean;
  isSentInvitationsError: boolean;
  onRetrySentInvitations: () => void;
  administrators: GroupMember[];
  members: GroupMember[];
  isMembersLoading: boolean;
  isMembersError: boolean;
  onRetryMembers: () => void;
  /** Fires with the current "find member" text, trimmed — pre-fills InviteFriendModal. */
  onInviteFriend: (query: string) => void;
}

/**
 * GRP-3's Members tab — a shared "find member" filter + "Invite friend"
 * button, then 5 status-grouped lists loaded together whenever the tab is
 * active (data comes from the parent's `useGroupMembersTabData()`, this
 * component stays presentational/controlled per client/CLAUDE.md).
 *
 * The search input's value is local, transient UI state — same "component
 * owns its own input, read at click time" precedent as
 * `GroupDiscoveryPanel`'s `query` — filtering happens client-side against
 * each row's display name (case-insensitive substring, no debounce, matches
 * the literal spec) since none of the 3 backing endpoints support a keyword
 * filter (GRP-3 open decision #2).
 *
 * "Waiting for group approve" only renders for `canManage` (owner/admin) —
 * a member calling the endpoint would 400, so the parent hook never even
 * fires that request for them. "Waiting for user accept" instead hides
 * itself when *empty* (per spec), independent of role — any member can see
 * invitations they personally sent — using the *unfiltered* count, not the
 * search-filtered one, so typing into "find member" never makes this
 * section reappear/disappear on its own.
 */
export function GroupMembersTab({
  canManage,
  currentUserId,
  joinRequests,
  isJoinRequestsLoading,
  isJoinRequestsError,
  onRetryJoinRequests,
  onAcceptJoinRequest,
  onDeclineJoinRequest,
  isAcceptingJoinRequest,
  isDecliningJoinRequest,
  sentInvitations,
  isSentInvitationsLoading,
  isSentInvitationsError,
  onRetrySentInvitations,
  administrators,
  members,
  isMembersLoading,
  isMembersError,
  onRetryMembers,
  onInviteFriend,
}: GroupMembersTabProps) {
  const [query, setQuery] = useState('');

  const filteredJoinRequests = joinRequests.filter((request) => matchesQuery(request.userFullName, query));
  const filteredAdministrators = administrators.filter((member) => matchesQuery(member.userFullName, query));
  const filteredMembers = members.filter((member) => matchesQuery(member.userFullName, query));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find member"
          aria-label="Find member"
          className="w-auto min-w-0 flex-1 sm:max-w-64"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onInviteFriend(query.trim())}
        >
          <IconSearch className="size-4" aria-hidden="true" />
          Invite friend
        </Button>
      </div>

      {canManage && (
        <Section
          title="Waiting for group approve"
          isLoading={isJoinRequestsLoading}
          isError={isJoinRequestsError}
          onRetry={onRetryJoinRequests}
          totalCount={joinRequests.length}
          filteredCount={filteredJoinRequests.length}
        >
          {filteredJoinRequests.map((request) => (
            <MemberRow
              key={request.id}
              avatarUrl={request.userAvatarUrl}
              name={request.userFullName}
              action={
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDecliningJoinRequest}
                    onClick={() => onDeclineJoinRequest(request.id)}
                  >
                    Decline
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isAcceptingJoinRequest}
                    onClick={() => onAcceptJoinRequest(request.id)}
                  >
                    Accept
                  </Button>
                </div>
              }
            />
          ))}
        </Section>
      )}

      {sentInvitations.length > 0 && (
        <Section
          title="Waiting for user accept"
          isLoading={isSentInvitationsLoading}
          isError={isSentInvitationsError}
          onRetry={onRetrySentInvitations}
          totalCount={sentInvitations.length}
          filteredCount={sentInvitations.filter((inv) => matchesQuery(inv.inviteeFullName, query)).length}
        >
          {sentInvitations
            .filter((invitation) => matchesQuery(invitation.inviteeFullName, query))
            .map((invitation) => (
              <MemberRow
                key={invitation.id}
                avatarUrl={null}
                name={invitation.inviteeFullName}
                subtitle={invitationStatusLabel(invitation)}
              />
            ))}
        </Section>
      )}

      <Section
        title="Group administrator"
        isLoading={isMembersLoading}
        isError={isMembersError}
        onRetry={onRetryMembers}
        totalCount={administrators.length}
        filteredCount={filteredAdministrators.length}
      >
        {filteredAdministrators.map((member) => (
          <MemberRow
            key={member.id}
            avatarUrl={member.userAvatarUrl}
            name={member.userFullName}
            subtitle={member.roleName === 'group_owner' ? 'Owner' : 'Admin'}
            isCurrentUser={member.userId === currentUserId}
          />
        ))}
      </Section>

      <Section
        title="Members"
        isLoading={isMembersLoading}
        isError={isMembersError}
        onRetry={onRetryMembers}
        totalCount={members.length}
        filteredCount={filteredMembers.length}
      >
        {filteredMembers.map((member) => (
          <MemberRow
            key={member.id}
            avatarUrl={member.userAvatarUrl}
            name={member.userFullName}
            isCurrentUser={member.userId === currentUserId}
          />
        ))}
      </Section>

      <section aria-label="Blacklist" className="flex flex-col gap-2">
        <h3 className="text-2sm font-semibold text-text-primary">Blacklist</h3>
        <p className="text-2sm text-text-muted">Coming soon.</p>
      </section>
    </div>
  );
}
