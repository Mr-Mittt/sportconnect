import { useCallback, useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFriends } from '@/features/friends/hooks/useFriends';
import type { MentionSource } from '@/shared/components/MentionInput';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { matchesName } from '@/shared/lib/nameMatch';
import { GROUP_MEMBER_SEARCH_SIZE, useGroupMemberSearch } from './useGroupMemberSearch';

/**
 * CLIENT-GL-50 part 2: the people an `@` offers in a post box or a post's comment boxes. Who can be tagged follows the post:
 * a user post (`groupId` null) tags the caller's friends (the whole list is on the client, filtered with the shared name
 * rule, no minimum length); a group post tags the group's members through the server search (B23). The comments under a
 * post use the same source as the post. One query for every box that shares this source: only one has the caret at a
 * time, and it reports the word after its `@` (`null` = none, nothing is requested and no list shows).
 *
 * Nobody is offered themselves: tagging yourself in a post or a comment is pointless (a record command in a session thread is
 * the one place a player may be the caller, and it has its own list).
 *
 * `enabled` keeps a source that nobody can use yet (no comment dialog open) from fetching anything.
 */
export function usePostMentionSource(groupId: number | null, enabled = true): MentionSource {
  // `search` counts the `@` words that have ended: a list is never carried from one `@` word into the next.
  const [typing, setTyping] = useState<{ query: string | null; search: number }>({ query: null, search: 0 });
  const { query, search } = typing;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const setQuery = useCallback(
    (next: string | null) =>
      setTyping((current) =>
        current.query === next
          ? current
          : { query: next, search: next === null ? current.search + 1 : current.search },
      ),
    [],
  );
  // `null` settles at once: an `@` opened right after another never starts from the last word's results.
  const debounced = useDebouncedValue(query, 150, query === null);
  const asking = enabled ? query : null;
  const friends = useFriends(enabled && groupId === null && query !== null);
  const members = useGroupMemberSearch(
    enabled && groupId !== null ? groupId : undefined,
    asking === null ? null : debounced,
    search,
  );

  return useMemo<MentionSource>(() => {
    let people: { id: string; name: string; avatarUrl: string | null }[] = [];
    if (asking !== null) {
      people =
        groupId === null
          ? (friends.data ?? [])
              .filter((friend) => friend.id !== currentUserId && matchesName(friend.fullName, asking))
              .slice(0, GROUP_MEMBER_SEARCH_SIZE)
              .map((friend) => ({ id: friend.id, name: friend.fullName, avatarUrl: friend.avatarUrl }))
          : (members.data ?? [])
              .filter((member) => member.userId !== currentUserId)
              .slice(0, GROUP_MEMBER_SEARCH_SIZE)
              .map((member) => ({ id: member.userId, name: member.fullName, avatarUrl: member.avatarUrl }));
    }
    return {
      options: people.map((person) => ({ id: person.id, name: person.name, label: person.name, avatarUrl: person.avatarUrl })),
      onQueryChange: setQuery,
    };
  }, [asking, groupId, friends.data, members.data, currentUserId, setQuery]);
}
