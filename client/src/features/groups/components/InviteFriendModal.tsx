import { useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

interface InviteFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `GroupMembersTab`'s "find member" text at the moment "Invite friend"
   * was clicked — the spec's "preset search key". */
  initialQuery: string;
}

/**
 * GRP-3's invite-friend modal — ships with mocked results on purpose (per
 * the ticket's scope split): the search input works and is pre-filled, but
 * results are always a static "Search coming soon" state, no network call,
 * no invite action wired. Real search (`GET /api/users/search`) + invite
 * (`POST /api/groups/{groupId}/invitations`) is GRP-4.
 *
 * Same dialog chrome as `JoinGroupModal`. The parent remounts this via a
 * `key` bump on every open (same `createGroupOpenCount` pattern
 * `GroupsPage` already uses for `CreateGroupModal`/`AddSportModal`), so
 * `initialQuery` only needs to seed local state once per open, not sync on
 * every prop change.
 */
export function InviteFriendModal({ isOpen, onClose, initialQuery }: InviteFriendModalProps) {
  const [query, setQuery] = useState(initialQuery);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="border-hairline-b flex items-center justify-between border-border px-4 py-3">
          <DialogTitle>Invite a friend</DialogTitle>
          <DialogClose aria-label="Close" />
        </div>
        <div className="border-hairline-b border-border px-4 py-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search friends by name…"
            aria-label="Search friends"
          />
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-2sm text-text-muted">Search coming soon.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
