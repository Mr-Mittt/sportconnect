import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useGroupMemberSearch } from '@/features/feed/hooks/useGroupMemberSearch';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useFriends } from '@/features/friends/hooks/useFriends';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import { useSessionAttributeSchema } from '@/shared/hooks/useSessionAttributeSchema';
import { useSportAttributeSchema } from '@/shared/hooks/useSportAttributeSchema';
import { useRawMySportProfiles } from '@/shared/hooks/useRawMySportProfiles';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import type { Location } from '@/shared/types/location';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { useCreateSession } from './hooks/useCreateSession';
import { toAudienceResults } from './audienceResults';
import { collectSchemaPaths, pickPaths } from './sessionAttributePaths';
import { isSessionDialogError } from './sessionErrors';
import type { CreateSessionPayload, Session } from './types';

/** The group a session is created for: the form's group mode (CLIENT-GROUP-SESSION-1). */
export interface CreateSessionGroup {
  id: number;
  sportId: number;
  name: string;
}

/**
 * `CreateSessionModal`'s full data boundary — modal open state, the nested `LocationPicker`
 * flow, favorite-locations dropdown, invite-friends search, and the create mutation itself.
 * Extracted out of `useMatchesPageData` (CLIENT-SESSION-7) so `HomeFeedPage`/`GroupsPage`/
 * `FriendsPage`/`MatchesPage` each get their own modal instance from the exact same
 * implementation, rather than `MatchesPage` owning the only copy. Takes no arguments — every
 * piece of state here is local to one open/close cycle of the modal.
 *
 * CLIENT-GROUP-SESSION-1: `openCreateGroupSessionModal(group)` opens the form in group mode (`createGroup`); the member search of the
 * "Specific members" audience (`audienceSearch`) runs only then, and never offers the caller. `onGroupSessionCreated` is
 * called with the new session after a group-mode create succeeds (the page opens its detail).
 */
export function useCreateSessionModalData(options: { onGroupSessionCreated?: (session: Session) => void } = {}) {
  const sportCatalog = useSportCatalog();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createGroup, setCreateGroup] = useState<CreateSessionGroup | null>(null);
  const [audienceQuery, setAudienceQuery] = useState('');
  const [isCreateLocationPickerOpen, setIsCreateLocationPickerOpen] = useState(false);
  const [createFormSportId, setCreateFormSportId] = useState<number | null>(null);
  const [selectedLocationForCreate, setSelectedLocationForCreate] = useState<Location | null>(null);
  // CLIENT-SESSION-15: the session-attributes draft for the still-open create form. Reset to `{}`
  // on sport change and on close (same lifecycle as `selectedLocationForCreate`).
  const [sessionAttributes, setSessionAttributes] = useState<Record<string, unknown>>({});
  // CLIENT-SESSION-17 Part B: per-`#ref`-node "Other…" draft options, keyed by the node's full
  // path. Session-local — never written to the user's profile — and cleared on the same lifecycle
  // as `sessionAttributes`.
  const [refDraftOptions, setRefDraftOptions] = useState<Record<string, unknown[]>>({});

  const openForm = (group: CreateSessionGroup | null) => {
    setCreateGroup(group);
  // SPORT-5: this modal embeds the zero-sport-profile gate, which lists the catalogue the
  // same way the "Add sport" pill does — so it needs the same freshness. No pill to hang a
  // re-read on here, so opening the modal is the trigger. Fire-and-forget: the gate renders
  // from cached data immediately and updates if the re-read brings something new, which is
  // safe because nothing is *hidden* by being slightly late, unlike the pill's open/dialog
  // decision.
  void sportCatalog.refetch();
    setIsCreateModalOpen(true);
  };
  /** The standalone form. Takes no argument on purpose: pages hand it straight to `onClick`, which would pass an event. */
  const openCreateModal = () => openForm(null);
  /** The form in group mode, for a session of this group (CLIENT-GROUP-SESSION-1). */
  const openCreateGroupSessionModal = (group: CreateSessionGroup) => openForm(group);
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateGroup(null);
    setAudienceQuery('');
    setSelectedLocationForCreate(null);
    setCreateFormSportId(null);
    // CLIENT-SESSION-15: same reason as `selectedLocationForCreate` — this draft is hook-owned,
    // so the modal's own `key` remount doesn't clear it.
    setSessionAttributes({});
    setRefDraftOptions({});
    // CLIENT-MODAL-1: the modal's own fields reset via its `key` remount, but `isCreateError`
    // is a prop off this mutation — without this the previous failure renders again the next
    // time the modal opens. Declared below; only ever called from an event handler, so the
    // binding is initialised by then.
    createSessionMutation.reset();
  };

  // CLIENT-SESSION-5: the favorites dropdown needs to be scoped to whatever sport is *currently
  // selected in the still-open, uncommitted create form* — CreateSessionModal owns that Sport
  // field as its own local state (per its documented "owns its own transient form state"
  // precedent), so it reports the currently-effective sportId up via this callback purely for
  // query-scoping, without the field itself being lifted/controlled here. Reuses
  // `createFormSportId` (already populated by `onOpenLocationPickerForCreate` below) as the same
  // single source of truth for both the dropdown and `useLocationPickerData`.
  const onEffectiveSportChangeForCreate = (sportId: number | undefined) => {
    const next = sportId ?? null;
    setCreateFormSportId((prev) => {
      // CLIENT-SESSION-15 scope change: a sport change resets the whole create form. The modal
      // clears its own fields (render-phase, keyed on the sport *key*); the hook-owned pieces —
      // the chosen location (sport-scoped) and the attributes draft — are cleared here. Only on a
      // real sport -> *different* real sport: `sportId` briefly reports `undefined` whenever
      // `sportIdForKey` sees the catalog store mid-refetch, and a null<->id flicker must not wipe
      // a location the user already picked.
      if (prev !== null && next !== null && prev !== next) {
        setSelectedLocationForCreate(null);
        setSessionAttributes({});
        setRefDraftOptions({});
      }
      return next;
    });
  };
  const favoriteLocationsQuery = useFavoriteLocations(createFormSportId ?? undefined, isCreateModalOpen);
  const favoriteLocationIds = useMemo(
    () => new Set((favoriteLocationsQuery.data?.content ?? []).map((location) => location.id)),
    [favoriteLocationsQuery.data],
  );
  const favoriteLocationMutation = useFavoriteLocation();
  const unfavoriteLocationMutation = useUnfavoriteLocation();
  const toggleFavoriteLocation = (location: Location) => {
    if (createFormSportId === null) return;
    const payload = { locationId: location.id, sportId: createFormSportId };
    if (favoriteLocationIds.has(location.id)) {
      unfavoriteLocationMutation.mutate(payload);
    } else {
      favoriteLocationMutation.mutate(payload);
    }
  };

  // SPORT-3: before the user has picked a sport in the still-open create form, fall back to the
  // live catalog's first sport (was hardcoded to football's id) — reactive, so a picker opened
  // before the catalog's first fetch resolves still gets a valid id once it does.
  const firstCatalogSportId = useSportCatalogStore((state) => state.sports[0]?.id);
  const locationPickerData = useLocationPickerData(
    createFormSportId ?? firstCatalogSportId ?? 0,
    isCreateLocationPickerOpen,
    (location) => setSelectedLocationForCreate(location),
    () => setIsCreateLocationPickerOpen(false),
  );
  // useLocationPickerData returns only its *derived* state/handlers — isOpen/onClose are the
  // inputs it was given, not part of its return value, so LocationPicker's full prop set is
  // assembled here rather than in the page component.
  const locationPickerForCreate = {
    isOpen: isCreateLocationPickerOpen,
    onClose: () => setIsCreateLocationPickerOpen(false),
    ...locationPickerData,
    favoriteLocationIds,
    onToggleFavorite: toggleFavoriteLocation,
    isTogglingFavorite: favoriteLocationMutation.isPending || unfavoriteLocationMutation.isPending,
  };

  // CLIENT-SESSION-15: the chosen sport's *session* attribute schema (A17) + the caller's own
  // active profile for it, for `CreateSessionModal`'s "Session detail" section. `createFormSportId`
  // is fed by `onEffectiveSportChangeForCreate` (the modal reports its effective sportId up) — the
  // same populate-then-settle pattern `useFavoriteLocations` above already relies on.
  const sessionSchemaQuery = useSessionAttributeSchema(createFormSportId ?? undefined);
  const sessionAttributeSchema: ResolvedSportAttributeSchema | null = sessionSchemaQuery.data;
  // SPORT-16: the sport's *profile* schema — the base a `#ref` node inherits its `layout` from
  // (`node.layout ?? baseAttr.layout`). Shares the `['sportAttributeSchema', sportId]` query cache
  // with `/profile`, so this is usually a warm hit; lazy via the hook's own `enabled` guard.
  const profileSchemaQuery = useSportAttributeSchema(createFormSportId ?? undefined);
  const refBaseSchema: ResolvedSportAttributeSchema | null = profileSchemaQuery.data;
  const rawProfiles = useRawMySportProfiles();
  const profileForCreateSport = rawProfiles.data?.find(
    (profile) => profile.sportId === createFormSportId && profile.isActive,
  );
  // CLIENT-SESSION-17 Part B: a `#ref` session node's choices come from the creator's own profile
  // attributes at the node's `prefillKey` (A23 made `#ref` a *data source*, not a one-shot
  // pre-fill — so CLIENT-SESSION-15's `buildSessionAttributePrefill` is gone). `null` until the
  // profile query settles; `RefField` renders an empty control + hint in that window.
  const refChoiceSource: Record<string, unknown> | null =
    profileForCreateSport?.attributes ?? null;

  const onSessionAttributeChange = (key: string, value: unknown) =>
    setSessionAttributes((current) => ({ ...current, [key]: value }));

  const onAddRefDraftOption = (path: string, value: unknown) =>
    setRefDraftOptions((current) => ({
      ...current,
      [path]: [...(current[path] ?? []), value],
    }));

  const createSessionMutation = useCreateSession();
  const submitCreate = (payload: CreateSessionPayload) => {
    // Trim the draft to the current sport's schema paths (a draft can still carry keys from a
    // sport the user briefly had selected). Omit `attributes` entirely when nothing survives.
    const trimmed = sessionAttributeSchema
      ? pickPaths(sessionAttributes, collectSchemaPaths(sessionAttributeSchema))
      : {};
    const attributes = Object.keys(trimmed).length > 0 ? trimmed : undefined;
    // A group session opens in the session detail once it exists (owner, 2026-11-20); a standalone one does not.
    const createdForGroup = createGroup !== null;
    createSessionMutation.mutate(
      { ...payload, attributes },
      {
        onSuccess: (session) => {
          closeCreateModal();
          if (createdForGroup) options.onGroupSessionCreated?.(session);
        },
      },
    );
  };

  // CLIENT-SESSION-4: only needed while the create form is open — the "Invite your friend"
  // field's client-side search is a filter over this full unpaginated list, no new endpoint.
  const friendsQuery = useFriends(isCreateModalOpen);

  // CLIENT-GROUP-SESSION-1: the "Specific members" picker's search over the group's members (B23), typed text debounced.
  // Idle (no call) while the box is empty or the form is not in group mode; the caller is never offered.
  const currentUserId = useAuthStore((state) => state.user?.id);
  const debouncedAudienceQuery = useDebouncedValue(audienceQuery.trim(), 200, audienceQuery.trim() === '');
  const audienceSearchQuery = useGroupMemberSearch(
    createGroup?.id,
    createGroup !== null && debouncedAudienceQuery !== '' ? debouncedAudienceQuery : null,
  );
  const audienceResults = useMemo(
    () => toAudienceResults(audienceSearchQuery.data, currentUserId),
    [audienceSearchQuery.data, currentUserId],
  );

  return {
    isCreateModalOpen,
    openCreateModal,
    openCreateGroupSessionModal,
    /** The group the open form is for, `null` for a standalone session. */
    createGroup,
    audienceSearch: {
      query: audienceQuery,
      onQueryChange: setAudienceQuery,
      results: audienceResults,
      isSearching: audienceSearchQuery.isFetching || audienceQuery.trim() !== debouncedAudienceQuery,
      isSearchError: audienceSearchQuery.isError,
    },
    closeCreateModal,
    selectedLocationForCreate,
    onOpenLocationPickerForCreate: (sportId: number) => {
      setCreateFormSportId(sportId);
      setIsCreateLocationPickerOpen(true);
    },
    locationPickerForCreate,
    submitCreate,
    isCreating: createSessionMutation.isPending,
    // CLIENT-ERR-7: a session dialog code (e.g. not a group admin) is shown by the app-wide error
    // dialog, so the form's own line only covers everything else.
    isCreateError: createSessionMutation.isError && !isSessionDialogError(createSessionMutation.error),
    /** Specific copy for the form's inline line (sport/location/fee 400 codes); `undefined` keeps the generic line. */
    createErrorText: getCodedErrorMessage(createSessionMutation.error),
    friends: friendsQuery.data ?? [],
    isFriendsLoading: friendsQuery.isLoading,
    onEffectiveSportChangeForCreate,
    favoriteLocationsForCreate: favoriteLocationsQuery.data?.content ?? [],
    isFavoriteLocationsLoading: favoriteLocationsQuery.isLoading,
    // CLIENT-SESSION-5: selecting a favorite straight from the dropdown bypasses the full
    // LocationPicker flow entirely — same setter useLocationPickerData's own onSelect uses, just
    // called directly since there's no picker dialog to also close here.
    onSelectLocationForCreate: setSelectedLocationForCreate,
    // CLIENT-SESSION-15: the "Session detail" attributes section — `null` when the chosen sport
    // has no session schema (the modal hides the section entirely then).
    sessionAttributeSchema,
    sessionAttributeValues: sessionAttributes,
    onSessionAttributeChange,
    // CLIENT-SESSION-17 Part B: `#ref` node rendering — the creator's profile as choice source,
    // plus their accumulated "Other…" drafts.
    refChoiceSource,
    refDraftOptions,
    onAddRefDraftOption,
    // SPORT-16: profile schema for `#ref`→base `layout` inheritance. `null` until it settles.
    refBaseSchema,
  };
}
