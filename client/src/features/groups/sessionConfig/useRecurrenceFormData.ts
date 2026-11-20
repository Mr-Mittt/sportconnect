import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useGroupMemberSearch } from '@/features/feed/hooks/useGroupMemberSearch';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import { toAudienceResults } from '@/features/session/audienceResults';
import { collectSchemaPaths, pickPaths } from '@/features/session/sessionAttributePaths';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useRawMySportProfiles } from '@/shared/hooks/useRawMySportProfiles';
import { useSessionAttributeSchema } from '@/shared/hooks/useSessionAttributeSchema';
import { useSportAttributeSchema } from '@/shared/hooks/useSportAttributeSchema';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import type { Location } from '@/shared/types/location';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import type { PickerMember } from '@/shared/components/MemberPicker';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { useSaveGroupSessionRecurrence } from './hooks';
import { toRecurrencePayload, type RecurrenceFormValues } from './recurrenceForm';
import type { GroupSessionRecurrence } from './types';

/** What the recurrence form (CLIENT-GROUP-SESSION-5) reads and does; `GroupSessionsConfigSection` renders the form from it. */
export interface RecurrenceFormData {
  /** The form is on screen. */
  isOpen: boolean;
  /** The configuration being edited, `null` while adding one. */
  editing: GroupSessionRecurrence | null;
  /** Changes on every open and on "Create more", so the form's own fields start over (a `key`). */
  formKey: number;
  openAdd: () => void;
  openEdit: (recurrence: GroupSessionRecurrence) => void;
  /** Closes the form (and the saved dialog) and forgets everything. */
  close: () => void;

  selectedLocation: Location | null;
  onOpenLocationPicker: () => void;
  locationPicker: LocationPickerProps;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  onSelectLocation: (location: Location) => void;

  /** The "Specific members" picker's search over the group's members (B23); never offers the caller. */
  audienceSearch: {
    query: string;
    onQueryChange: (query: string) => void;
    results: PickerMember[];
    isSearching: boolean;
    isSearchError: boolean;
  };

  sessionAttributeSchema: ResolvedSportAttributeSchema | null;
  sessionAttributeValues: Record<string, unknown>;
  onSessionAttributeChange: (key: string, value: unknown) => void;
  refChoiceSource: Record<string, unknown> | null;
  refDraftOptions: Record<string, unknown[]>;
  onAddRefDraftOption: (path: string, value: unknown) => void;
  refBaseSchema: ResolvedSportAttributeSchema | null;

  /** Saves the form: a new configuration, or a replacement of the one being edited. On success `isSaved` turns true. */
  save: (values: RecurrenceFormValues) => void;
  isSaving: boolean;
  isSaveError: boolean;
  saveErrorText?: string;
  /** The last save went through: the form gives way to the "saved" dialog. */
  isSaved: boolean;
  /** What was just saved is a draft (the server says so): it will not generate a session until completed. */
  isSavedDraft: boolean;
  /** "Create more": the saved dialog goes and the form starts over as if just opened (the day too). */
  onCreateMore: () => void;
}

/**
 * CLIENT-GROUP-SESSION-5's data boundary: open state and mode (add or edit) of the recurrence form, the location picker, the favourites, the sport's
 * session-attribute schema, the member search and the save mutation. It composes the same lower-level hooks as `useCreateSessionModalData`
 * (which is left alone: the standalone and group-session forms are not touched) for the group's sport. Without a sport (`sportId` undefined)
 * nothing is fetched.
 */
export function useRecurrenceFormData(groupId: number | undefined, sportId: number | undefined): RecurrenceFormData {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<GroupSessionRecurrence | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [isSavedDraft, setIsSavedDraft] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [sessionAttributes, setSessionAttributes] = useState<Record<string, unknown>>({});
  const [refDraftOptions, setRefDraftOptions] = useState<Record<string, unknown[]>>({});
  const [audienceQuery, setAudienceQuery] = useState('');

  const saveMutation = useSaveGroupSessionRecurrence();

  const start = (recurrence: GroupSessionRecurrence | null) => {
    saveMutation.reset();
    setEditing(recurrence);
    setSelectedLocation(recurrence?.location ?? null);
    setSessionAttributes(recurrence?.attributes ?? {});
    setRefDraftOptions({});
    setAudienceQuery('');
    setIsPickerOpen(false);
    setIsSaved(false);
    setIsSavedDraft(false);
    setFormKey((key) => key + 1);
  };
  const openAdd = () => {
    start(null);
    setIsOpen(true);
  };
  const openEdit = (recurrence: GroupSessionRecurrence) => {
    start(recurrence);
    setIsOpen(true);
  };
  const close = () => {
    start(null);
    setIsOpen(false);
  };

  const favoriteLocationsQuery = useFavoriteLocations(sportId, isOpen);
  const favoriteLocationIds = useMemo(
    () => new Set((favoriteLocationsQuery.data?.content ?? []).map((location) => location.id)),
    [favoriteLocationsQuery.data],
  );
  const favoriteMutation = useFavoriteLocation();
  const unfavoriteMutation = useUnfavoriteLocation();
  const toggleFavorite = (location: Location) => {
    if (sportId === undefined) return;
    const payload = { locationId: location.id, sportId };
    if (favoriteLocationIds.has(location.id)) unfavoriteMutation.mutate(payload);
    else favoriteMutation.mutate(payload);
  };
  const locationPickerData = useLocationPickerData(
    sportId ?? 0,
    isPickerOpen,
    (location) => setSelectedLocation(location),
    () => setIsPickerOpen(false),
  );
  const locationPicker: LocationPickerProps = {
    isOpen: isPickerOpen,
    onClose: () => setIsPickerOpen(false),
    ...locationPickerData,
    favoriteLocationIds,
    onToggleFavorite: toggleFavorite,
    isTogglingFavorite: favoriteMutation.isPending || unfavoriteMutation.isPending,
  };

  // The sport's session attributes (A17) and the owner's own profile as the `#ref` choice source, as in the session form.
  const sessionSchemaQuery = useSessionAttributeSchema(isOpen ? sportId : undefined);
  const sessionAttributeSchema: ResolvedSportAttributeSchema | null = sessionSchemaQuery.data;
  const profileSchemaQuery = useSportAttributeSchema(isOpen ? sportId : undefined);
  const rawProfiles = useRawMySportProfiles();
  const profileForSport = rawProfiles.data?.find((profile) => profile.sportId === sportId && profile.isActive);

  const currentUserId = useAuthStore((state) => state.user?.id);
  const debouncedAudienceQuery = useDebouncedValue(audienceQuery.trim(), 200, audienceQuery.trim() === '');
  const audienceSearchQuery = useGroupMemberSearch(
    groupId,
    isOpen && debouncedAudienceQuery !== '' ? debouncedAudienceQuery : null,
  );
  const audienceResults = useMemo(
    () => toAudienceResults(audienceSearchQuery.data, currentUserId),
    [audienceSearchQuery.data, currentUserId],
  );

  const save = (values: RecurrenceFormValues) => {
    if (groupId === undefined) return;
    // The draft can still carry keys of a field the form no longer shows: only the schema's own paths go.
    const trimmed = sessionAttributeSchema ? pickPaths(sessionAttributes, collectSchemaPaths(sessionAttributeSchema)) : {};
    const attributes = Object.keys(trimmed).length > 0 ? trimmed : undefined;
    saveMutation.mutate(
      { groupId, recurrenceId: editing?.id, payload: toRecurrencePayload(values, selectedLocation, attributes) },
      {
        onSuccess: (saved) => {
          setIsSavedDraft(saved.draft);
          setIsSaved(true);
        },
      },
    );
  };

  return {
    isOpen,
    editing,
    formKey,
    openAdd,
    openEdit,
    close,
    selectedLocation,
    onOpenLocationPicker: () => setIsPickerOpen(true),
    locationPicker,
    favoriteLocations: favoriteLocationsQuery.data?.content ?? [],
    isFavoriteLocationsLoading: favoriteLocationsQuery.isLoading,
    onSelectLocation: setSelectedLocation,
    audienceSearch: {
      query: audienceQuery,
      onQueryChange: setAudienceQuery,
      results: audienceResults,
      isSearching: audienceSearchQuery.isFetching || audienceQuery.trim() !== debouncedAudienceQuery,
      isSearchError: audienceSearchQuery.isError,
    },
    sessionAttributeSchema,
    sessionAttributeValues: sessionAttributes,
    onSessionAttributeChange: (key, value) => setSessionAttributes((current) => ({ ...current, [key]: value })),
    refChoiceSource: profileForSport?.attributes ?? null,
    refDraftOptions,
    onAddRefDraftOption: (path, value) =>
      setRefDraftOptions((current) => ({ ...current, [path]: [...(current[path] ?? []), value] })),
    refBaseSchema: profileSchemaQuery.data,
    save,
    isSaving: saveMutation.isPending,
    isSaveError: saveMutation.isError,
    saveErrorText: getCodedErrorMessage(saveMutation.error),
    isSaved,
    isSavedDraft,
    onCreateMore: () => start(null),
  };
}
