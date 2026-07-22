import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { MIN_SEARCH_LENGTH, type InviteResultRow } from '@/features/groups/useInviteFriendModalData';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface InviteFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  rows: InviteResultRow[];
  isSearching: boolean;
  isSearchError: boolean;
  onInvite: (userId: string) => void;
}

/**
 * GRP-4's real invite-friend modal — replaces GRP-3's mocked "Search coming
 * soon" state. Presentational and controlled per client/CLAUDE.md: all
 * search/invite state comes from the parent's `useInviteFriendModalData()`.
 *
 * Only friend rows are ever rendered — a non-friend search hit is dropped
 * entirely by the data hook rather than shown disabled (user decision,
 * 2026-07-22). Among friend rows, `member`/`invited` rows are already sorted
 * to the end of `rows` by the hook, so this component just renders them in
 * order: an `invited`/`member` row gets a muted status label instead of a
 * button, an invitable `friend` row gets an enabled "Invite" button that
 * disables itself while that row's own send is in flight (`isSending`) — a
 * per-row inline error renders under a row whose send failed (the group's
 * `allowMemberInvites` setting or member-capacity cap aren't knowable ahead
 * of a click, unlike the member/invited/friend gates above).
 */
export function InviteFriendModal({
  isOpen,
  onClose,
  inputValue,
  onInputChange,
  rows,
  isSearching,
  isSearchError,
  onInvite,
}: InviteFriendModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader title="Invite a friend" className="border-hairline-b border-border px-4 py-3" />
        <div className="border-hairline-b border-border px-4 py-3">
          <Input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Search friends by name…"
            aria-label="Search friends"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isSearching && <p className="text-2sm text-text-muted">Searching…</p>}
          {isSearchError && <p className="text-2sm text-text-danger">Couldn't search. Try again.</p>}
          {!isSearching && !isSearchError && inputValue.trim().length < MIN_SEARCH_LENGTH && (
            <p className="text-2sm text-text-muted">Type at least 2 characters to search.</p>
          )}
          {!isSearching &&
            !isSearchError &&
            inputValue.trim().length >= MIN_SEARCH_LENGTH &&
            rows.length === 0 && <p className="text-2sm text-text-muted">No friends found.</p>}
          <div className="flex flex-col gap-2.5">
            {rows.map(({ user, action, isSending, error }) => (
              <div key={user.id} className="flex flex-col gap-1">
                <div className="border-hairline flex items-center justify-between gap-3 rounded-lg border-border p-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-8 shrink-0">
                      {user.avatarUrl !== null && <AvatarImage src={user.avatarUrl} alt="" />}
                      <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
                        {initialsFor(user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-2sm font-medium text-text-primary">
                        {user.fullName}
                      </div>
                      {user.username !== null && (
                        <div className="truncate text-2xs text-text-muted">@{user.username}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {action === 'member' && (
                      <span className="text-2xs text-text-muted">Already a member</span>
                    )}
                    {action === 'invited' && (
                      <span className="text-2xs text-text-muted">Already invited</span>
                    )}
                    {action === 'friend' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSending}
                        onClick={() => onInvite(user.id)}
                      >
                        Invite
                      </Button>
                    )}
                  </div>
                </div>
                {error !== null && (
                  <p role="alert" className="px-1 text-2xs text-text-danger">
                    {error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
