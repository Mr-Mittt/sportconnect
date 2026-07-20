import { useCallback, useMemo, useState } from 'react';
import { useJoinGroup } from '@/features/feed/hooks/useJoinGroup';
import { useJoinRequests } from '@/features/feed/hooks/useJoinRequests';
import { usePublicGroups } from '@/features/feed/hooks/usePublicGroups';

/**
 * JoinGroupModal's data boundary (FEED-5) — same role as useCommentsData:
 * owns the search text + composes the three real hooks it needs
 * (usePublicGroups, useJoinRequests, useJoinGroup), so JoinGroupModal itself
 * stays presentational and controlled, matching client/CLAUDE.md's
 * component convention (and restoring Storybook testability with static
 * props, which calling these hooks directly inside the component would
 * break). `pendingGroupIds` cross-references the search results against the
 * user's already-pending-only join requests so a row's action state
 * ("Request to join" vs "Pending") derives from two independent sources
 * without JoinGroupModal needing to know either hook exists.
 *
 * `isOpen` gates both queries (same reasoning as useComments' `isOpen`
 * param) — the modal component stays mounted between opens (only its
 * `Dialog` toggles), so without this it would keep fetching in the
 * background even while visually closed.
 */
export function useJoinGroupModalData(
  currentUserId: string | undefined,
  sportId: number | undefined,
  isOpen: boolean,
) {
  const [inputValue, setInputValue] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');

  const searchQuery = usePublicGroups(sportId, submittedKeyword, isOpen);
  const joinRequestsQuery = useJoinRequests(isOpen ? currentUserId : undefined);
  const joinMutation = useJoinGroup();

  const pendingGroupIds = useMemo(
    () => new Set((joinRequestsQuery.data?.content ?? []).map((request) => request.groupId)),
    [joinRequestsQuery.data],
  );

  const submitSearch = useCallback(() => setSubmittedKeyword(inputValue.trim()), [inputValue]);
  // GRP-1: opening the modal from GroupDiscoveryPanel's shared "Group name or
  // invite code" input — sets both pieces of state directly from the typed
  // value rather than `setInputValue` + `submitSearch()`, which would read
  // the stale pre-update `inputValue` from this render's closure.
  const openSearch = useCallback((query: string) => {
    setInputValue(query);
    setSubmittedKeyword(query.trim());
  }, []);
  const requestToJoin = useCallback(
    (groupName: string) => joinMutation.mutate({ groupName }),
    [joinMutation],
  );

  return {
    inputValue,
    setInputValue,
    submitSearch,
    openSearch,
    results: searchQuery.data?.content ?? [],
    isSearching: searchQuery.isLoading,
    isSearchError: searchQuery.isError,
    pendingGroupIds,
    requestToJoin,
    isRequesting: joinMutation.isPending,
    isRequestError: joinMutation.isError,
  };
}
