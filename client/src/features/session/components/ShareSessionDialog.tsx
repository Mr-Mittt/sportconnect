import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyHint } from '@/shared/components/EmptyHint';
import { matchesName } from '@/shared/lib/nameMatch';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { SHARE_LIMIT } from '../hooks/useShareSession';
import type { SharePerson } from '../types';
import { LoadMoreButton } from './LoadMoreButton';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function PersonAvatar({ person }: { person: SharePerson }) {
  return (
    <Avatar className="size-6 shrink-0">
      {person.avatarUrl !== null && <AvatarImage src={person.avatarUrl} alt="" />}
      <AvatarFallback className="text-2xs">{initialsFor(person.fullName)}</AvatarFallback>
    </Avatar>
  );
}

interface ShareSessionBodyProps {
  i18nOverridePrefix?: string;
  /** Who is listed: the caller's friends (standalone session) or the group's members (group session, CLIENT-GROUP-SESSION-3). */
  kind: 'friends' | 'group';
  people: SharePerson[];
  isPeopleLoading: boolean;
  isPeopleError: boolean;
  /** A group's members come 100 at a time: another page can be loaded (always false for friends). */
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  /** Ids of the people who already have a `JOINED` row in the session (the players the modal loaded). */
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
  kind,
  people,
  isPeopleLoading,
  isPeopleError,
  hasMore,
  isFetchingMore,
  onLoadMore,
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

  const isGroup = kind === 'group';
  // The filter works on what is loaded, for both kinds (an API search is CLIENT-SESSION-53); a group's other pages come with "Load more".
  const trimmedQuery = query.trim();
  const visible = (person: SharePerson) => trimmedQuery === '' || matchesName(person.fullName, trimmedQuery);
  const pending = people.filter((person) => !joinedIds.has(person.id) && visible(person));
  const joined = people.filter((person) => joinedIds.has(person.id) && visible(person));

  const isAtLimit = selected.size >= SHARE_LIMIT;

  const toggle = (personId: string, next: boolean) => {
    setIsSentShown(false);
    setSelected((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(personId);
      else updated.delete(personId);
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
      <DialogHeader title={isGroup ? t('detail.share.groupTitle') : t('detail.share.title')} className="border-hairline-b border-border px-4 py-3" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {isPeopleLoading ? (
          <p className="text-2xs text-text-muted">{t('common.loading')}</p>
        ) : isPeopleError ? (
          <p role="alert" className="text-2sm text-text-danger">
            {isGroup ? t('detail.share.membersError') : t('detail.share.friendsError')}
          </p>
        ) : people.length === 0 ? (
          <EmptyHint>{isGroup ? t('detail.share.noMembers') : t('detail.share.noFriends')}</EmptyHint>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isGroup ? t('detail.share.groupSearchPlaceholder') : t('detail.share.searchPlaceholder')}
              aria-label={isGroup ? t('detail.share.groupSearchLabel') : t('detail.share.searchLabel')}
            />
            {pending.length === 0 && joined.length === 0 ? (
              <EmptyHint>{isGroup ? t('detail.share.noMembersResults') : t('detail.share.noResults')}</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1">
                {pending.map((person) => {
                  const isSent = sentIds.has(person.id);
                  const isTicked = isSent || selected.has(person.id);
                  return (
                    <li key={person.id}>
                      <label className="border-hairline flex cursor-pointer items-center gap-2 rounded-lg border-border p-2 hover:bg-surface-1">
                        <Checkbox
                          checked={isTicked}
                          disabled={isSent || (isAtLimit && !isTicked)}
                          onCheckedChange={(next) => toggle(person.id, next)}
                          aria-label={t('detail.share.select', { name: person.fullName })}
                        />
                        <PersonAvatar person={person} />
                        <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{person.fullName}</span>
                      </label>
                    </li>
                  );
                })}
                {joined.map((person) => (
                  <li key={person.id} className="border-hairline flex items-center gap-2 rounded-lg border-border p-2">
                    <PersonAvatar person={person} />
                    <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{person.fullName}</span>
                    <span className="shrink-0 text-2xs text-text-muted">{t('detail.share.joined')}</span>
                  </li>
                ))}
              </ul>
            )}
            {isGroup && hasMore && (
              <LoadMoreButton isFetching={isFetchingMore} onClick={onLoadMore} ariaLabel={t('detail.share.loadMoreMembers')} />
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
 * CLIENT-SESSION-49: the "Share with friends" dialog of a standalone session (the Players header's Share button); since
 * CLIENT-GROUP-SESSION-3 it is "Share with group members" for a group session, listing the group's members 100 at a time with a
 * "Load more" (the caller never among them). Every friend
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
