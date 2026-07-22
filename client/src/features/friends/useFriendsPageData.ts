import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useSportProfilesForUser } from '@/shared/hooks/useSportProfilesForUser';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAcceptFriendRequest } from './hooks/useAcceptFriendRequest';
import { useDeclineFriendRequest } from './hooks/useDeclineFriendRequest';
import { useFriendRequestsReceived } from './hooks/useFriendRequestsReceived';
import { useFriendRequestsSent } from './hooks/useFriendRequestsSent';
import { useFriends } from './hooks/useFriends';
import { useSendFriendRequest } from './hooks/useSendFriendRequest';
import { useUserProfile } from './hooks/useUserProfile';
import { useUserSearch } from './hooks/useUserSearch';
import type { FriendRequestRow, FriendSectionKey, FriendUser, SelectedPerson } from './types';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2; // matches the backend's own minimum (400s below it)

function matchesQuery(name: string, normalizedQuery: string): boolean {
  return normalizedQuery === '' || name.toLowerCase().includes(normalizedQuery);
}

/**
 * FRIEND-1's page-level data boundary — same orchestration-hook role as
 * `useGroupMembersTabData`. Owns the rail's search/Add-mode/collapsed-
 * section/selection UI state and composes every real hook this page needs,
 * so `FriendsPage`/`FriendRail`/`FriendProfilePanel` stay presentational and
 * controlled per client/CLAUDE.md.
 *
 * Online and Blocked always resolve to `[]` — no presence system or
 * block/blacklist concept exists in the backend at all (FRIEND-1's own
 * scoping decision, mirrors GRP-3's Blacklist treatment) — every accepted
 * friend renders under Offline instead.
 *
 * Selected-person resolution never re-fetches data another query already
 * has: a friend-list row is used as-is (already the full `UserResponse`
 * shape, so `friendshipStatus` is definitionally `FRIENDS`); a row found in
 * the received/sent pending-request lists resolves to
 * `PENDING_RECEIVED`/`PENDING_SENT` (with `requestId` for the former, needed
 * for accept/decline) without a separate profile fetch beyond `useUserProfile`
 * for bio/coverUrl; only a genuine directory-search selection (not yet in any
 * of the three lists) falls back to the search result's own `friendshipStatus`
 * (typically `NONE`). `useUserProfile` itself is only enabled for a selection
 * that ISN'T already a known friend (friend rows already carry bio/coverUrl).
 */
export function useFriendsPageData() {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [query, setQuery] = useState('');
  const [isAddMode, setIsAddMode] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<FriendSectionKey, boolean>>({
    online: false,
    friendRequests: false,
    offline: false,
    blocked: false,
  });
  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>(undefined);

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const trimmedDebounced = debouncedQuery.trim();

  const friendsQuery = useFriends();
  const receivedQuery = useFriendRequestsReceived();
  const sentQuery = useFriendRequestsSent();
  const searchQuery = useUserSearch(
    trimmedDebounced,
    isAddMode && trimmedDebounced.length >= MIN_SEARCH_LENGTH,
  );

  // Plain per-render derivations (not memoized) — fine to recompute every
  // render, and avoids exhaustive-deps churn from a fresh `?? []` array
  // showing up as an unstable memo dependency. Memoized derivations below
  // read the underlying `xQuery.data` directly instead.
  const friends = friendsQuery.data ?? [];
  const received = receivedQuery.data ?? [];
  const sent = sentQuery.data ?? [];
  const searchResults = searchQuery.data?.content ?? [];

  const normalizedQuery = query.trim().toLowerCase();

  const offlineFriends = useMemo(
    () => (friendsQuery.data ?? []).filter((friend) => matchesQuery(friend.fullName, normalizedQuery)),
    [friendsQuery.data, normalizedQuery],
  );

  const friendRequestRows = useMemo<FriendRequestRow[]>(() => {
    const incoming: FriendRequestRow[] = (receivedQuery.data ?? []).map((request) => ({
      id: request.senderId,
      name: request.senderName,
      direction: 'incoming',
    }));
    const outgoing: FriendRequestRow[] = (sentQuery.data ?? []).map((request) => ({
      id: request.receiverId,
      name: request.receiverName,
      direction: 'outgoing',
    }));
    return [...incoming, ...outgoing].filter((row) => matchesQuery(row.name, normalizedQuery));
  }, [receivedQuery.data, sentQuery.data, normalizedQuery]);

  const selectedFriend = friends.find((friend) => friend.id === selectedPersonId);
  const isKnownFriend = selectedFriend !== undefined;
  const profileQuery = useUserProfile(isKnownFriend ? undefined : selectedPersonId);
  const sportsQuery = useSportProfilesForUser(selectedPersonId);

  const baseSelectedPerson: FriendUser | undefined = selectedFriend ?? profileQuery.data;
  const selectedSearchResult = searchResults.find((result) => result.id === selectedPersonId);

  const selectedPerson = useMemo<SelectedPerson | undefined>(() => {
    if (selectedPersonId === undefined || baseSelectedPerson === undefined) return undefined;

    if (isKnownFriend) {
      return { ...baseSelectedPerson, friendshipStatus: 'FRIENDS', requestId: null };
    }
    const receivedMatch = (receivedQuery.data ?? []).find(
      (request) => request.senderId === selectedPersonId,
    );
    if (receivedMatch !== undefined) {
      return {
        ...baseSelectedPerson,
        friendshipStatus: 'PENDING_RECEIVED',
        requestId: receivedMatch.requestId,
      };
    }
    const sentMatch = (sentQuery.data ?? []).find((request) => request.receiverId === selectedPersonId);
    if (sentMatch !== undefined) {
      return { ...baseSelectedPerson, friendshipStatus: 'PENDING_SENT', requestId: null };
    }
    return {
      ...baseSelectedPerson,
      friendshipStatus: selectedSearchResult?.friendshipStatus ?? 'NONE',
      requestId: null,
    };
  }, [
    selectedPersonId,
    baseSelectedPerson,
    isKnownFriend,
    receivedQuery.data,
    sentQuery.data,
    selectedSearchResult,
  ]);

  const sendMutation = useSendFriendRequest();
  const acceptMutation = useAcceptFriendRequest();
  const declineMutation = useDeclineFriendRequest();

  return {
    currentUserId,

    query,
    setQuery,
    clearQuery: () => {
      setQuery('');
      setIsAddMode(false);
    },

    isAddMode,
    toggleAddMode: () => setIsAddMode((previous) => !previous),
    exitAddMode: () => setIsAddMode(false),

    collapsedSections,
    toggleSection: (key: FriendSectionKey) =>
      setCollapsedSections((previous) => ({ ...previous, [key]: !previous[key] })),

    onlineFriends: [] as FriendUser[],
    offlineFriends,
    totalFriendsCount: friends.length,
    friendRequestRows,
    totalFriendRequestsCount: received.length + sent.length,
    blockedFriends: [] as FriendUser[],
    isFriendsLoading: friendsQuery.isLoading || receivedQuery.isLoading || sentQuery.isLoading,
    isFriendsError: friendsQuery.isError || receivedQuery.isError || sentQuery.isError,

    searchResults,
    isSearching: searchQuery.isLoading,
    isSearchError: searchQuery.isError,

    selectedPersonId,
    selectPerson: setSelectedPersonId,
    selectedPerson,
    isSelectedPersonLoading: !isKnownFriend && selectedPersonId !== undefined && profileQuery.isLoading,
    selectedSports: sportsQuery.data,
    isSelectedSportsLoading: sportsQuery.isLoading,

    sendRequest: (userId: string) => sendMutation.mutate(userId),
    isSendingRequest: sendMutation.isPending,
    acceptRequest: (requestId: string) => acceptMutation.mutate(requestId),
    isAcceptingRequest: acceptMutation.isPending,
    // Mirrors the design reference's own behavior: declining clears the
    // selection (there's nothing left to act on for a declined, non-friend
    // person), rather than leaving the panel open re-resolved to NONE.
    declineRequest: (requestId: string) =>
      declineMutation.mutate(requestId, { onSuccess: () => setSelectedPersonId(undefined) }),
    isDecliningRequest: declineMutation.isPending,
  };
}

export type FriendsPageData = ReturnType<typeof useFriendsPageData>;
