import { useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { UnfriendConfirmDialog } from './UnfriendConfirmDialog';
import type { SelectedPerson } from '../types';
import type { SportProfile } from '@/shared/types/sport';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface FriendProfilePanelProps {
  person: SelectedPerson;
  sports: SportProfile[];
  isSportsLoading: boolean;
  onSendRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onUnfriend: () => void;
  /** Called when the unfriend confirm dialog closes — the parent uses it to
   * `reset()` the unfriend mutation so a prior error can't survive a reopen
   * (`CLIENT-MODAL-1`). */
  onUnfriendDialogClose: () => void;
  isUnfriendError: boolean;
  isActionPending: boolean;
}

/**
 * FRIEND-1's profile panel — top half of the fixed 50/50 `FriendContent`
 * split. Cover strip is plain `surface-1` (an optional `coverUrl` renders
 * over it) rather than a per-person ramp color: unlike a group, there's no
 * backend field a friend's cover color could come from, so this doesn't
 * invent one — the avatar fallback uses the same neutral accent styling
 * every other avatar in the app already defaults to.
 *
 * The docked action bar is driven entirely by `person.friendshipStatus` —
 * not a mockup-style "is this a directory result" branch, since the real
 * backend already tells us this directly (see `useFriendsPageData`'s
 * resolution logic). `FRIENDS` shows a single `Friend` button that opens a
 * menu (just `Unfriend` for now) → a confirm dialog.
 *
 * Achievements starts collapsed (user decision, 2026-07-22 — reduces empty
 * space for a friend with few sports/no bio, since the section's body is
 * just static "Coming soon" text). Local state, not lifted to the page: the
 * parent remounts this component via `key={person.id}` on every selection
 * change, which already resets it for free per person.
 */
export function FriendProfilePanel({
  person,
  sports,
  isSportsLoading,
  onSendRequest,
  onAccept,
  onDecline,
  onCancel,
  onUnfriend,
  onUnfriendDialogClose,
  isUnfriendError,
  isActionPending,
}: FriendProfilePanelProps) {
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isUnfriendConfirmOpen, setIsUnfriendConfirmOpen] = useState(false);

  function closeUnfriendConfirm() {
    setIsUnfriendConfirmOpen(false);
    onUnfriendDialogClose();
  }

  return (
    <div className="border-hairline flex h-full flex-col overflow-hidden rounded-xl border-border bg-surface-2">
      <div className="relative h-18 shrink-0 bg-surface-1">
        {person.coverUrl !== null && (
          <img src={person.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="-mt-7 mb-2.5 flex items-end gap-3">
          <Avatar className="size-16 border-3 border-surface-2">
            {person.avatarUrl !== null && <AvatarImage src={person.avatarUrl} alt="" />}
            <AvatarFallback className="text-lg">{initialsFor(person.fullName)}</AvatarFallback>
          </Avatar>
          <div className="pb-1.5 text-base font-medium text-text-primary">{person.fullName}</div>
        </div>

        {person.bio !== null && person.bio !== '' && (
          <p className="mb-2.5 text-2sm text-text-secondary">{person.bio}</p>
        )}

        {!isSportsLoading && sports.length > 0 && (
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {sports.map((sport) => (
              <span
                key={sport.key}
                className="rounded-full bg-surface-1 px-2.25 py-0.75 text-2xs text-text-primary"
              >
                {sport.label}
              </span>
            ))}
          </div>
        )}

        <Collapsible
          open={isAchievementsOpen}
          onOpenChange={setIsAchievementsOpen}
          className="border-hairline-t border-border pt-2.5 pb-3.5"
        >
          <CollapsibleTrigger>
            <span className="text-2sm font-medium text-text-primary">Achievements</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1">
            <p className="text-2xs text-text-muted">Coming soon.</p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {person.friendshipStatus !== 'FRIENDS' && (
        <div className="border-hairline-t flex shrink-0 justify-end border-border px-4 py-3">
          {person.friendshipStatus === 'NONE' && (
            <Button type="button" variant="primary" onClick={onSendRequest} disabled={isActionPending}>
              Send a friend request
            </Button>
          )}
          {person.friendshipStatus === 'PENDING_SENT' && (
            <div className="flex items-center gap-2">
              <span className="text-2xs text-text-muted">Waiting for response</span>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isActionPending}>
                Cancel request
              </Button>
            </div>
          )}
          {person.friendshipStatus === 'PENDING_RECEIVED' && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onDecline} disabled={isActionPending}>
                Decline
              </Button>
              <Button type="button" variant="primary" onClick={onAccept} disabled={isActionPending}>
                Accept
              </Button>
            </div>
          )}
        </div>
      )}

      {person.friendshipStatus === 'FRIENDS' && (
        <div className="border-hairline-t flex shrink-0 justify-end border-border px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                disabled={isActionPending}
              >
                Friend
                <IconChevronDown className="ml-0.5 size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-42 p-1">
              <DropdownMenuItem
                onSelect={() => setIsUnfriendConfirmOpen(true)}
                className="py-1.5 text-text-danger"
              >
                Unfriend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <UnfriendConfirmDialog
            isOpen={isUnfriendConfirmOpen}
            onClose={closeUnfriendConfirm}
            onConfirm={onUnfriend}
            isSubmitting={isActionPending}
            isError={isUnfriendError}
            personName={person.fullName}
          />
        </div>
      )}
    </div>
  );
}
