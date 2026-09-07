import { useMemo, useState } from 'react';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useFriends } from '@/features/friends/hooks/useFriends';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import { useSessionAttributeSchema } from '@/shared/hooks/useSessionAttributeSchema';
import { useRawMySportProfiles } from '@/shared/hooks/useRawMySportProfiles';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import type { Location } from '@/shared/types/location';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { useCreateSession } from './hooks/useCreateSession';
import { buildSessionAttributePrefill, collectSchemaPaths, pickPaths } from './sessionAttributePrefill';
import type { CreateSessionPayload } from './types';

/**
 * `CreateSessionModal`'s full data boundary — modal open state, the nested `LocationPicker`
 * flow, favorite-locations dropdown, invite-friends search, and the create mutation itself.
 * Extracted out of `useMatchesPageData` (CLIENT-SESSION-7) so `HomeFeedPage`/`GroupsPage`/
 * `FriendsPage`/`MatchesPage` each get their own modal instance from the exact same
 * implementation, rather than `MatchesPage` owning the only copy. Takes no arguments — every
 * piece of state here is local to one open/close cycle of the modal.
 */
export function useCreateSessionModalData() {
  const sportCatalog = useSportCatalog();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateLocationPickerOpen, setIsCreateLocationPickerOpen] = useState(false);
  const [createFormSportId, setCreateFormSportId] = useState<number | null>(null);
  const [selectedLocationForCreate, setSelectedLocationForCreate] = useState<Location | null>(null);
  // CLIENT-SESSION-15: the session-attributes draft for the still-open create form. Reset to `{}`
  // on sport change and on close (same lifecycle as `selectedLocationForCreate`); `prefilledForSport`
  // guards the one-time profile pre-fill per selected sport.
  const [sessionAttributes, setSessionAttributes] = useState<Record<string, unknown>>({});
  const [prefilledForSport, setPrefilledForSport] = useState<number | null>(null);

  const openCreateModal = () => {
  // SPORT-5: this modal embeds the zero-sport-profile gate, which lists the catalogue the
  // same way the "Add sport" pill does — so it needs the same freshness. No pill to hang a
  // re-read on here, so opening the modal is the trigger. Fire-and-forget: the gate renders
  // from cached data immediately and updates if the re-read brings something new, which is
  // safe because nothing is *hidden* by being slightly late, unlike the pill's open/dialog
  // decision.
  void sportCatalog.refetch();
    setIsCreateModalOpen(true);
  };
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setSelectedLocationForCreate(null);
    setCreateFormSportId(null);
    // CLIENT-SESSION-15: same reason as `selectedLocationForCreate` — this draft is hook-owned,
    // so the modal's own `key` remount doesn't clear it.
    setSessionAttributes({});
    setPrefilledForSport(null);
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
      if (next !== prev) {
        // CLIENT-SESSION-15 scope change: a sport change resets the whole create form. The modal
        // clears its own fields (render-phase, keyed on the effective sportId); the hook-owned
        // pieces — the chosen location (sport-scoped) and the attributes draft — are cleared here.
        setSelectedLocationForCreate(null);
        setSessionAttributes({});
        setPrefilledForSport(null);
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
  const rawProfiles = useRawMySportProfiles();
  const profileForCreateSport = rawProfiles.data?.find(
    (profile) => profile.sportId === createFormSportId && profile.isActive,
  );

  // Pre-fill `prefillable` (#ref) nodes from that profile, once per selected sport — a render-phase
  // state adjustment (React's documented "reset/seed state when an input changes" pattern), not an
  // effect. Runs once the schema *and* the profile query have both settled for the current sport;
  // `prefilledForSport` stops it re-firing, and the sport-change reset above clears both the draft
  // and this guard so the next sport pre-fills fresh.
  if (
    createFormSportId !== null &&
    sessionAttributeSchema !== null &&
    !rawProfiles.isLoading &&
    prefilledForSport !== createFormSportId
  ) {
    const seeds = buildSessionAttributePrefill(
      sessionAttributeSchema,
      profileForCreateSport?.attributes ?? null,
    );
    setPrefilledForSport(createFormSportId);
    // User edits win over a seed for the same path (they can't realistically exist yet — the
    // section only renders once the schema is here — but the overlay order is the safe one).
    setSessionAttributes((current) => ({ ...seeds, ...current }));
  }

  const onSessionAttributeChange = (key: string, value: unknown) =>
    setSessionAttributes((current) => ({ ...current, [key]: value }));

  const createSessionMutation = useCreateSession();
  const submitCreate = (payload: CreateSessionPayload) => {
    // Trim the draft to the current sport's schema paths (a draft can still carry keys from a
    // sport the user briefly had selected). Omit `attributes` entirely when nothing survives.
    const trimmed = sessionAttributeSchema
      ? pickPaths(sessionAttributes, collectSchemaPaths(sessionAttributeSchema))
      : {};
    const attributes = Object.keys(trimmed).length > 0 ? trimmed : undefined;
    createSessionMutation.mutate({ ...payload, attributes }, { onSuccess: closeCreateModal });
  };

  // CLIENT-SESSION-4: only needed while the create form is open — the "Invite your friend"
  // field's client-side search is a filter over this full unpaginated list, no new endpoint.
  const friendsQuery = useFriends(isCreateModalOpen);

  return {
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    selectedLocationForCreate,
    onOpenLocationPickerForCreate: (sportId: number) => {
      setCreateFormSportId(sportId);
      setIsCreateLocationPickerOpen(true);
    },
    locationPickerForCreate,
    submitCreate,
    isCreating: createSessionMutation.isPending,
    isCreateError: createSessionMutation.isError,
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
  };
}
