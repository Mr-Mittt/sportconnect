import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJoinGroup } from '@/features/feed/hooks/useJoinGroup';
import { useJoinRequests } from '@/features/feed/hooks/useJoinRequests';
import { usePublicGroups } from '@/features/feed/hooks/usePublicGroups';
import { sportIdForKey, sportKeyForId } from '@/features/feed/sportIdMap';
import type { GroupSearchResult } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';

export interface GroupedSearchResults {
  sportKey: SportKey;
  sportProfile: SportProfile;
  results: GroupSearchResult[];
}

/**
 * JoinGroupModal's data boundary (FEED-5; GRP-6 added the multi-select sport
 * filter + grouped results). Same role as useCommentsData: owns the search
 * text + sport-filter selection, composes the real hooks it needs
 * (usePublicGroups, useJoinRequests, useJoinGroup), so JoinGroupModal itself
 * stays presentational and controlled, matching client/CLAUDE.md's
 * component convention.
 *
 * `isOpen` gates both queries (same reasoning as useComments' `isOpen`
 * param) — the modal component stays mounted between opens (only its
 * `Dialog` toggles), so without this it would keep fetching in the
 * background even while visually closed. For the same reason, the
 * multi-select sport filter can't just be `useState`'s initial value — it's
 * re-seeded via `seededForOpenRef` exactly once per open (not on every
 * render while already open, which would otherwise silently reset the
 * user's in-progress pill choices if `sportProfiles`' reference changes):
 * `lockedSport` (the page's active sport tab) pre-selects just that one
 * pill, or every one of the user's sports if the page is on "All".
 *
 * GRP-6: the query only runs once a keyword has been submitted
 * (`enabled: isOpen && submittedKeyword !== ''`) — a deliberate change from
 * FEED-5's original "browse with no query" default. `sportIds` (plural) is
 * sent to `usePublicGroups`; results come back as one flat page, which this
 * hook groups by `sportId` into `groupedResults`, ordered to match the
 * filter pills — no per-sport fan-out, per A10's single combined-filter
 * endpoint.
 */
export function useJoinGroupModalData(
  currentUserId: string | undefined,
  lockedSport: SportKey | null,
  sportProfiles: SportProfile[],
  isOpen: boolean,
) {
  const [inputValue, setInputValue] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [selectedSports, setSelectedSports] = useState<Set<SportKey>>(new Set());

  const seededForOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      seededForOpenRef.current = false;
      return;
    }
    if (seededForOpenRef.current) return;
    seededForOpenRef.current = true;
    setSelectedSports(
      lockedSport !== null ? new Set([lockedSport]) : new Set(sportProfiles.map((sport) => sport.key)),
    );
  }, [isOpen, lockedSport, sportProfiles]);

  const sportIds = useMemo(
    () =>
      Array.from(selectedSports)
        .map((key) => sportIdForKey(key))
        .filter((id): id is number => id !== undefined),
    [selectedSports],
  );

  const searchQuery = usePublicGroups(sportIds, submittedKeyword, isOpen && submittedKeyword !== '');
  const joinRequestsQuery = useJoinRequests(isOpen ? currentUserId : undefined);
  const joinMutation = useJoinGroup();

  const pendingGroupIds = useMemo(
    () => new Set((joinRequestsQuery.data?.content ?? []).map((request) => request.groupId)),
    [joinRequestsQuery.data],
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfiles],
  );

  // A selected sport with zero matches produces no rows and thus no section —
  // there's one combined query now, not an independent per-sport call to
  // hang an explicit empty section off of.
  const groupedResults = useMemo<GroupedSearchResults[]>(() => {
    const results = searchQuery.data?.content ?? [];
    const bySport = new Map<SportKey, GroupSearchResult[]>();
    for (const result of results) {
      const key = sportKeyForId(result.sportId);
      if (key === undefined) continue;
      const bucket = bySport.get(key);
      if (bucket) bucket.push(result);
      else bySport.set(key, [result]);
    }
    return Array.from(selectedSports)
      .filter((key) => bySport.has(key))
      .map((key) => ({ sportKey: key, sportProfile: sportsByKey[key], results: bySport.get(key)! }));
  }, [searchQuery.data, selectedSports, sportsByKey]);

  const toggleSport = useCallback((key: SportKey) => {
    setSelectedSports((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
    selectedSports,
    toggleSport,
    groupedResults,
    isSearching: searchQuery.isLoading,
    isSearchError: searchQuery.isError,
    pendingGroupIds,
    requestToJoin,
    isRequesting: joinMutation.isPending,
    isRequestError: joinMutation.isError,
  };
}
