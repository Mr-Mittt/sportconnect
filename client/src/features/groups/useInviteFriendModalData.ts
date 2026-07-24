import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserSearch } from '@/features/friends/hooks/useUserSearch';
import { useGroupMembers } from '@/features/feed/hooks/useGroupMembers';
import { useSentInvitations } from '@/features/feed/hooks/useSentInvitations';
import { useSendGroupInvitation } from '@/features/feed/hooks/useSendGroupInvitation';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSearchResult } from '@/features/friends/types';

const SEARCH_DEBOUNCE_MS = 300;
// Matches U6's own minimum (400s below it) — exported so InviteFriendModal
// can render the same "type at least N characters" hint without duplicating
// the number.
export const MIN_SEARCH_LENGTH = 2;

export type InviteRowAction = 'friend' | 'member' | 'invited';

export interface InviteResultRow {
  user: UserSearchResult;
  action: InviteRowAction;
  isSending: boolean;
  error: string | null;
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as ApiResponse<null> | undefined)?.message;
    if (message !== undefined) return message;
  }
  return 'Something went wrong. Try again.';
}

/**
 * GRP-4's invite-friend modal data boundary — same role as
 * `useJoinGroupModalData`. Owns the search input (re-seeded once per open
 * from `initialQuery`, same `seededForOpenRef` pattern), composes
 * `useUserSearch` (U6, reused directly from the friends feature — same
 * endpoint) with `useGroupMembers`/`useSentInvitations`, both cache-shared
 * with `GroupMembersTab`'s already-active queries (no extra network calls
 * while the Members tab is open), and `useSendGroupInvitation`.
 *
 * U6 doesn't filter by group or friendship at all, so this hook does both
 * client-side per user decision (2026-07-22): only `FRIENDS` rows are kept
 * at all (a non-friend would just 400 on invite — `not-friend` rows are
 * dropped entirely, not shown disabled), and within the remaining friend
 * rows, anyone already a member or already invited is pushed to the end of
 * the list (via a stable partition, not a full re-sort) rather than
 * filtered out — the row still renders, badged, so the user can see why
 * there's no Invite action.
 *
 * There's no continuous debounce-triggered "submit" step like
 * `useJoinGroupModalData`'s explicit `submitSearch` — the search input is
 * debounced continuously (same as `useFriendsPageData`'s Add mode), so
 * seeding `inputValue` from `initialQuery` on open is itself enough to
 * "auto-run" the search ~300ms later with no extra user action.
 *
 * Per-row send state (`pendingIds`/`errorsByUserId`) is tracked locally
 * because a single `useMutation` instance can't represent multiple
 * concurrent in-flight calls — each `sendInvite` call drives its own
 * `onMutate`/`onError`/`onSettled` callbacks instead of reading the
 * mutation's own single `isPending`/`error`.
 */
export function useInviteFriendModalData(
  groupId: number | undefined,
  isOpen: boolean,
  initialQuery: string,
) {
  const [inputValue, setInputValue] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorsByUserId, setErrorsByUserId] = useState<Record<string, string>>({});

  const seededForOpenRef = useRef(false);
  // Guards the close-time reset below the same way `seededForOpenRef`
  // guards the open-time one — "run once per close", not on every render
  // while `isOpen` stays false.
  const resetForCloseRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      seededForOpenRef.current = false;
      if (resetForCloseRef.current) return;
      resetForCloseRef.current = true;
      // Reset here, on close, not only on the next open — an effect can't
      // run until after the next open's first paint, so a reset that only
      // fired on open would flash the previous session's stale query text
      // and (from TanStack Query's cache, keyed by that exact text) its
      // stale results for one frame, then clear ~300ms later once
      // `debouncedQuery` finally caught up. Resetting immediately on close
      // means state is already blank by the time a later open's first
      // render happens, so there's nothing stale left to flash.
      setInputValue('');
      setPendingIds(new Set());
      setErrorsByUserId({});
      return;
    }
    resetForCloseRef.current = false;
    if (seededForOpenRef.current) return;
    seededForOpenRef.current = true;
    setInputValue(initialQuery);
    setPendingIds(new Set());
    setErrorsByUserId({});
  }, [isOpen, initialQuery]);

  const trimmedQuery = inputValue.trim();
  // While closed, force-settle immediately rather than waiting out the
  // normal typing-speed debounce — see useDebouncedValue's own comment on
  // `immediate` for why this is what actually closes the stale-flash race
  // (the close-time reset above only fixes it for reopens that happen
  // after the debounce would have settled anyway; this fixes it
  // unconditionally).
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS, !isOpen);

  const searchQuery = useUserSearch(
    debouncedQuery,
    isOpen && debouncedQuery.length >= MIN_SEARCH_LENGTH,
  );
  const membersQuery = useGroupMembers(groupId, isOpen);
  const sentInvitationsQuery = useSentInvitations(groupId, isOpen);
  const sendMutation = useSendGroupInvitation(groupId);

  const memberIds = useMemo(
    () => new Set((membersQuery.data?.content ?? []).map((member) => member.userId)),
    [membersQuery.data],
  );
  const invitedIds = useMemo(
    () => new Set((sentInvitationsQuery.data?.content ?? []).map((invitation) => invitation.inviteeId)),
    [sentInvitationsQuery.data],
  );

  const rows = useMemo<InviteResultRow[]>(() => {
    const results = searchQuery.data?.content ?? [];
    const friends = results.filter((user) => user.friendshipStatus === 'FRIENDS');

    const toRow = (user: UserSearchResult): InviteResultRow => ({
      user,
      action: memberIds.has(user.id) ? 'member' : invitedIds.has(user.id) ? 'invited' : 'friend',
      isSending: pendingIds.has(user.id),
      error: errorsByUserId[user.id] ?? null,
    });

    const invitable = friends.filter((user) => !memberIds.has(user.id) && !invitedIds.has(user.id));
    const unavailable = friends.filter((user) => memberIds.has(user.id) || invitedIds.has(user.id));
    return [...invitable, ...unavailable].map(toRow);
  }, [searchQuery.data, memberIds, invitedIds, pendingIds, errorsByUserId]);

  const sendInvite = (userId: string) => {
    setPendingIds((previous) => new Set(previous).add(userId));
    setErrorsByUserId((previous) => {
      if (!(userId in previous)) return previous;
      return Object.fromEntries(Object.entries(previous).filter(([id]) => id !== userId));
    });
    sendMutation.mutate(userId, {
      onError: (error) => {
        setErrorsByUserId((previous) => ({ ...previous, [userId]: extractErrorMessage(error) }));
      },
      onSettled: () => {
        setPendingIds((previous) => {
          const next = new Set(previous);
          next.delete(userId);
          return next;
        });
      },
    });
  };

  return {
    inputValue,
    setInputValue,
    rows,
    isSearching: searchQuery.isLoading,
    isSearchError: searchQuery.isError,
    sendInvite,
  };
}

export type InviteFriendModalData = ReturnType<typeof useInviteFriendModalData>;
