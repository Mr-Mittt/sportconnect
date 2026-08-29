import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFriendsPageStore } from '@/app/friendsPageStore';
import { useSportProfilesForUser } from '@/shared/hooks/useSportProfilesForUser';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useUserInfo } from './useUserInfo';
import { useAcceptFriendRequest } from './hooks/useAcceptFriendRequest';
import { useCancelFriendRequest } from './hooks/useCancelFriendRequest';
import { useDeclineFriendRequest } from './hooks/useDeclineFriendRequest';
import { useFriendRequestsReceived } from './hooks/useFriendRequestsReceived';
import { useFriendRequestsSent } from './hooks/useFriendRequestsSent';
import { useFriends } from './hooks/useFriends';
import { useSendFriendRequest } from './hooks/useSendFriendRequest';
import { useUnfriend } from './hooks/useUnfriend';
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
 * `PENDING_RECEIVED`/`PENDING_SENT` (both carry `requestId` — accept/decline for
 * the former, cancel for the latter) without a separate profile fetch beyond `useUserInfo`
 * for bio/coverUrl; only a genuine directory-search selection (not yet in any
 * of the three lists) falls back to the search result's own `friendshipStatus`
 * (typically `NONE`). `useUserInfo` itself is only enabled for a selection
 * that ISN'T already a known friend (friend rows already carry bio/coverUrl).
 *
 * `query`/`isAddMode`/`selectedPersonId` live in `friendsPageStore`
 * (sessionStorage-persisted), not local `useState` — user-requested:
 * leaving the Friends page and coming back restores the rail's mode, search
 * text, and selection exactly as left. The underlying lists (friends/
 * requests/search) always refetch fresh on remount (TanStack Query's own
 * default `staleTime: 0`) — no extra wiring needed for that part. Once those
 * lists have settled, an effect below clears a restored `selectedPersonId`
 * that no longer resolves to anyone in them (`collapsedSections` stays local
 * — a transient UI toggle, not part of what was asked to persist).
 *
 * `focusPersonId` (CLIENT-NOTIF-5) is a one-shot "select this person on
 * arrival" intent, passed by `FriendsPage` from router `location.state` when a
 * friend-request notification is clicked. It seeds `selectedPersonId`, then —
 * once the lists settle — either resolves normally (profile panel opens) or, if
 * that id is in none of them (request cancelled/declined, account deactivated),
 * clears the selection and raises `focusUnavailable` so `FriendsPage` can show a
 * dialog. A `ref` fires it once per distinct value; a plain stale
 * `selectedPersonId` restored from `sessionStorage` still clears silently, no
 * dialog.
 */
export function useFriendsPageData(focusPersonId?: string) {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const query = useFriendsPageStore((state) => state.query);
  const setQuery = useFriendsPageStore((state) => state.setQuery);
  const isAddMode = useFriendsPageStore((state) => state.isAddMode);
  const setIsAddMode = useFriendsPageStore((state) => state.setIsAddMode);
  const selectedPersonId = useFriendsPageStore((state) => state.selectedPersonId);
  const setSelectedPersonId = useFriendsPageStore((state) => state.setSelectedPersonId);
  const [collapsedSections, setCollapsedSections] = useState<Record<FriendSectionKey, boolean>>({
    online: false,
    friendRequests: false,
    offline: false,
    blocked: false,
  });

  // CLIENT-NOTIF-5: seed the selection from a friend-request notification's
  // focus intent (`focusPersonId`, passed through from router `location.state`
  // by `FriendsPage`). Zustand setter only — the same shape as the auto-clear
  // effect below — so no React `setState` runs inside an effect. `FriendsPage`
  // keeps the router state until the user dismisses the "unavailable" dialog or
  // navigates away, so `focusUnavailable` (derived, further down) stays truthful
  // until then; there's nothing to store here.
  useEffect(() => {
    if (focusPersonId !== undefined) {
      setSelectedPersonId(focusPersonId);
    }
  }, [focusPersonId, setSelectedPersonId]);

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
  const profileQuery = useUserInfo(isKnownFriend ? undefined : selectedPersonId);
  const sportsQuery = useSportProfilesForUser(selectedPersonId);

  const baseSelectedPerson: FriendUser | undefined = selectedFriend ?? profileQuery.data;
  const selectedSearchResult = searchResults.find((result) => result.id === selectedPersonId);

  // A restored (or stale) selection is only judged once every list it could
  // legitimately come from is fully idle — `isFetching`, not just
  // `isLoading`, so a *background refetch* also defers the verdict. This
  // matters on accept: `acceptRequest` invalidates `friendKeys.all`, so
  // `received` and `friends` both refetch, and they can resolve in either
  // order. With only an `isLoading` gate, a render where `received` has
  // dropped the just-accepted person but `friends` hasn't picked them up yet
  // would look like "selection resolves to nobody" and wrongly clear it.
  // Waiting for every list to settle closes that window — by then the
  // accepted person is in `friends`. Search only counts while in Add mode,
  // since it isn't fetched at all otherwise.
  const hasSelectionSourcesSettled =
    !friendsQuery.isFetching &&
    !receivedQuery.isFetching &&
    !sentQuery.isFetching &&
    (!isAddMode || !searchQuery.isFetching);
  const isSelectedPersonAvailable =
    isKnownFriend ||
    (receivedQuery.data ?? []).some((request) => request.senderId === selectedPersonId) ||
    (sentQuery.data ?? []).some((request) => request.receiverId === selectedPersonId) ||
    (isAddMode && selectedSearchResult !== undefined);

  // User-requested: a `selectedPersonId` restored from a previous visit (or
  // one that's simply gone stale, e.g. an accepted/declined request) that no
  // longer resolves to anyone in the reloaded lists clears back to "no
  // selection" instead of silently keeping whatever `useUserInfo` might
  // still resolve for that raw id.
  useEffect(() => {
    if (selectedPersonId !== undefined && hasSelectionSourcesSettled && !isSelectedPersonAvailable) {
      setSelectedPersonId(undefined);
    }
  }, [selectedPersonId, hasSelectionSourcesSettled, isSelectedPersonAvailable, setSelectedPersonId]);

  // CLIENT-NOTIF-5: the friend-request notification's focus resolved to nobody.
  // Purely derived from the `focusPersonId` prop + the live lists — the moment
  // they settle without that person in any of them, this flips true and
  // `FriendsPage` shows a dialog; it flips back false on its own if the person
  // reappears (re-sent request) or `FriendsPage` drops the router state (dismiss
  // / navigate-away). The auto-clear effect above independently nulls
  // `selectedPersonId` in the same case; both read the same lists, so they
  // agree. A directory-search match doesn't count — a notification arrival is
  // never in Add mode.
  const focusUnavailable =
    focusPersonId !== undefined &&
    hasSelectionSourcesSettled &&
    !(friends.some((friend) => friend.id === focusPersonId) ||
      received.some((request) => request.senderId === focusPersonId) ||
      sent.some((request) => request.receiverId === focusPersonId));

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
      // `requestId` is carried here too now (CLIENT-NOTIF-5) — the PENDING_SENT
      // action bar's "Cancel request" needs it, same as PENDING_RECEIVED's
      // accept/decline.
      return { ...baseSelectedPerson, friendshipStatus: 'PENDING_SENT', requestId: sentMatch.requestId };
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
  const cancelMutation = useCancelFriendRequest();
  const unfriendMutation = useUnfriend();

  return {
    currentUserId,

    query,
    setQuery,
    clearQuery: () => {
      setQuery('');
      setIsAddMode(false);
    },

    isAddMode,
    toggleAddMode: () => setIsAddMode(!isAddMode),
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

    // CLIENT-NOTIF-5: a friend-request notification was clicked but its person
    // resolves to nobody in the friend/request lists — `FriendsPage` shows a
    // dialog and, on close, drops the router `location.state` that carried the
    // focus (which is what makes this flip back to false).
    focusUnavailable,
    selectedSports: sportsQuery.data,
    isSelectedSportsLoading: sportsQuery.isLoading,

    sendRequest: (userId: string) => sendMutation.mutate(userId),
    isSendingRequest: sendMutation.isPending,
    // Unlike decline/cancel, accept deliberately keeps the selection: the
    // requester becomes a friend and the panel re-resolves them to `FRIENDS`
    // (their now-friend profile). The `isFetching` gate on the auto-clear
    // effect above is what stops a transient deselect while the friends /
    // requests lists refetch after the mutation settles.
    acceptRequest: (requestId: string) => acceptMutation.mutate(requestId),
    isAcceptingRequest: acceptMutation.isPending,
    // Mirrors the design reference's own behavior: declining clears the
    // selection (there's nothing left to act on for a declined, non-friend
    // person), rather than leaving the panel open re-resolved to NONE.
    declineRequest: (requestId: string) =>
      declineMutation.mutate(requestId, { onSuccess: () => setSelectedPersonId(undefined) }),
    isDecliningRequest: declineMutation.isPending,
    // Same as decline: once the outgoing request is withdrawn there's nothing
    // left in the panel to act on, so clear the selection.
    cancelRequest: (requestId: string) =>
      cancelMutation.mutate(requestId, { onSuccess: () => setSelectedPersonId(undefined) }),
    isCancellingRequest: cancelMutation.isPending,
    // Unfriend takes the other person's user id (not a request id). Same
    // clear-the-selection-on-success behavior as decline/cancel — the person
    // drops out of the friends list on refetch, so there's nothing left to
    // show. `resetUnfriend` is called by `FriendProfilePanel` when its
    // confirm dialog closes so a failed attempt's error can't resurface on a
    // later reopen (`CLIENT-MODAL-1`).
    unfriend: (friendId: string) =>
      unfriendMutation.mutate(friendId, { onSuccess: () => setSelectedPersonId(undefined) }),
    isUnfriending: unfriendMutation.isPending,
    isUnfriendError: unfriendMutation.isError,
    resetUnfriend: () => unfriendMutation.reset(),
  };
}

export type FriendsPageData = ReturnType<typeof useFriendsPageData>;
