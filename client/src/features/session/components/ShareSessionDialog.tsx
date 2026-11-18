import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import type { FriendUser } from '@/features/friends/types';
import { EmptyHint } from '@/shared/components/EmptyHint';
import { matchesName } from '@/shared/lib/nameMatch';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { SHARE_LIMIT } from '../hooks/useShareSession';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function FriendAvatar({ friend }: { friend: FriendUser }) {
  return (
    <Avatar className="size-6 shrink-0">
      {friend.avatarUrl !== null && <AvatarImage src={friend.avatarUrl} alt="" />}
      <AvatarFallback className="text-2xs">{initialsFor(friend.fullName)}</AvatarFallback>
    </Avatar>
  );
}

interface ShareSessionBodyProps {
  i18nOverridePrefix?: string;
  friends: FriendUser[];
  isFriendsLoading: boolean;
  isFriendsError: boolean;
  /** Ids of the friends who already have a `JOINED` row in the session (the players the modal loaded). */
  joinedIds: ReadonlySet<string>;
  onShare: (userIds: string[], onDone: () => void) => void;
  isSharing: boolean;
  isShareError: boolean;
}

/**
 * The dialog's content, mounted only while the dialog is open (Radix unmounts it on close), so its local state (the filter, the
 * ticks, who was already sent to) starts fresh each time the dialog opens.
 */
function ShareSessionBody({
  friends,
  isFriendsLoading,
  isFriendsError,
  joinedIds,
  onShare,
  isSharing,
  isShareError,
  i18nOverridePrefix,
}: ShareSessionBodyProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [query, setQuery] = useState('');
  /** Ticked and not sent yet: what "Share (x)" counts. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Sent to in this dialog: shown ticked and disabled (already shared with), and never counted again. */
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(new Set());
  const [isSentShown, setIsSentShown] = useState(false);

  const trimmedQuery = query.trim();
  const visible = (friend: FriendUser) => trimmedQuery === '' || matchesName(friend.fullName, trimmedQuery);
  const pending = friends.filter((friend) => !joinedIds.has(friend.id) && visible(friend));
  const joined = friends.filter((friend) => joinedIds.has(friend.id) && visible(friend));

  const isAtLimit = selected.size >= SHARE_LIMIT;

  const toggle = (friendId: string, next: boolean) => {
    setIsSentShown(false);
    setSelected((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(friendId);
      else updated.delete(friendId);
      return updated;
    });
  };

  const send = () => {
    const userIds = [...selected];
    onShare(userIds, () => {
      setSentIds((previous) => new Set([...previous, ...userIds]));
      setSelected(new Set());
      setIsSentShown(true);
    });
  };

  return (
    <>
      <DialogHeader title={t('detail.share.title')} className="border-hairline-b border-border px-4 py-3" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {isFriendsLoading ? (
          <p className="text-2xs text-text-muted">{t('common.loading')}</p>
        ) : isFriendsError ? (
          <p role="alert" className="text-2sm text-text-danger">
            {t('detail.share.friendsError')}
          </p>
        ) : friends.length === 0 ? (
          <EmptyHint>{t('detail.share.noFriends')}</EmptyHint>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('detail.share.searchPlaceholder')}
              aria-label={t('detail.share.searchLabel')}
            />
            {pending.length === 0 && joined.length === 0 ? (
              <EmptyHint>{t('detail.share.noResults')}</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1">
                {pending.map((friend) => {
                  const isSent = sentIds.has(friend.id);
                  const isTicked = isSent || selected.has(friend.id);
                  return (
                    <li key={friend.id}>
                      <label className="border-hairline flex cursor-pointer items-center gap-2 rounded-lg border-border p-2 hover:bg-surface-1">
                        <Checkbox
                          checked={isTicked}
                          disabled={isSent || (isAtLimit && !isTicked)}
                          onCheckedChange={(next) => toggle(friend.id, next)}
                          aria-label={t('detail.share.select', { name: friend.fullName })}
                        />
                        <FriendAvatar friend={friend} />
                        <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{friend.fullName}</span>
                      </label>
                    </li>
                  );
                })}
                {joined.map((friend) => (
                  <li key={friend.id} className="border-hairline flex items-center gap-2 rounded-lg border-border p-2">
                    <FriendAvatar friend={friend} />
                    <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{friend.fullName}</span>
                    <span className="shrink-0 text-2xs text-text-muted">{t('detail.share.joined')}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="border-hairline-t flex flex-col gap-2 border-border px-4 py-3">
        {isAtLimit && (
          <p role="status" className="rounded-lg bg-amber-50 px-2 py-1 text-2xs font-medium text-amber-800">
            {t('detail.share.limit')}
          </p>
        )}
        {isSentShown && (
          <p role="status" className="flex items-center gap-1 text-2xs text-text-secondary">
            <IconCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {t('detail.share.sent')}
          </p>
        )}
        {isShareError && (
          <p role="alert" className="text-2xs text-text-danger">
            {t('detail.share.error')}
          </p>
        )}
        <Button variant="primary" size="sm" className="self-end" disabled={selected.size === 0 || isSharing} onClick={send}>
          {isSharing ? t('detail.share.sharing') : t('detail.share.action', { count: selected.size })}
        </Button>
      </div>
    </>
  );
}

interface ShareSessionDialogProps extends ShareSessionBodyProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CLIENT-SESSION-49: the "Share with friends" dialog of a standalone session (the Players header's Share button). Every friend
 * of the caller is listed: those who have not joined first, each with a checkbox, then those who have, labelled "Joined" with
 * no checkbox. "Share (x)" counts the friends ticked since the last send and is disabled at 0; at {@link SHARE_LIMIT} ticks a
 * footer warning shows and every unticked box is disabled (ticked ones can still be unticked). A send keeps the dialog open:
 * a generic "Session shared." line shows, the friends just sent to stay ticked but disabled, and x starts again from 0.
 *
 * Presentational: the friends, the sending and its failure come in as props (`SessionShareData`, owned by
 * `useSessionDetailModalData`); only the filter, the ticks and the sent set are local. A sibling Dialog of the session modal, not
 * nested in it (a nested popup misbehaves there, see `ConfirmLeaveDialog`).
 */
export function ShareSessionDialog({ isOpen, onClose, ...body }: ShareSessionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="max-w-md">
        <ShareSessionBody {...body} />
      </DialogContent>
    </Dialog>
  );
}
