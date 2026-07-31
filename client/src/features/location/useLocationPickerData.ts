import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocationSearch } from './hooks/useLocationSearch';
import { useResolveMapsUrl } from './hooks/useResolveMapsUrl';
import { useCreateLocation } from './hooks/useCreateLocation';
import type { Location } from './types';

export type LocationPickerMode = 'search' | 'create';

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * `LocationPicker`'s data boundary (CLIENT-LOC-1). Same role as
 * `useJoinGroupModalData`: owns all picker-local state (mode, search text,
 * paste-a-link/resolve state, the draggable pin, the create-mode form
 * fields), composes the real hooks it needs, so `LocationPicker` itself
 * stays presentational and controlled per `client/CLAUDE.md`.
 *
 * `sportId` is a required param, not internal state — LOC-1 made `Location`
 * sport-specific, so the caller (session create/edit, group recurrence
 * config) always already has a sport chosen by the time this opens.
 *
 * `isOpen` both gates the search query (same reasoning as
 * `useJoinGroupModalData`'s `isOpen` param — this hook instance can outlive
 * any single dialog open/close cycle if the parent keeps it mounted) and
 * resets all transient state back to a clean slate on close, so reopening
 * the picker never shows a stale in-progress "create" form or resolved pin
 * from the previous open.
 *
 * Selecting a `Location` — either clicking a search result or successfully
 * saving a newly created one — calls `onSelect` and then `onClose` itself;
 * picking a location is this component's one job, so it closes itself
 * rather than making every caller remember to.
 */
export function useLocationPickerData(
  sportId: number,
  isOpen: boolean,
  onSelect: (location: Location) => void,
  onClose: () => void,
) {
  const [mode, setMode] = useState<LocationPickerMode>('search');
  const [inputValue, setInputValue] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');

  const [mapsUrlInput, setMapsUrlInput] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [mapSeed, setMapSeed] = useState(0);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  // Guarded via a ref (not just the `isOpen` dependency) so this resets exactly once per
  // close, rather than being a plain unconditional setState-in-effect — this hook instance
  // can outlive any single dialog open/close cycle (same reasoning as
  // useJoinGroupModalData's seededForOpenRef), so without a reset a reopen would show
  // whatever was left over from the previous session (a stale "create" form, a resolved pin).
  const resetOnNextCloseRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      resetOnNextCloseRef.current = false;
      return;
    }
    if (resetOnNextCloseRef.current) return;
    resetOnNextCloseRef.current = true;
    setMode('search');
    setInputValue('');
    setSubmittedKeyword('');
    setMapsUrlInput('');
    setCoordinates(null);
    setMapSeed(0);
    setName('');
    setAddress('');
  }, [isOpen]);

  const searchQuery = useLocationSearch(sportId, submittedKeyword, isOpen && mode === 'search');
  const resolveMutation = useResolveMapsUrl();
  const createMutation = useCreateLocation();

  const submitSearch = useCallback(() => setSubmittedKeyword(inputValue.trim()), [inputValue]);

  const switchToCreate = useCallback(() => setMode('create'), []);
  const switchToSearch = useCallback(() => setMode('search'), []);

  const openGoogleMaps = useCallback(() => {
    const query = inputValue.trim() !== '' ? inputValue.trim() : submittedKeyword;
    const url = `https://www.google.com/maps/search/?api=1${query !== '' ? `&query=${encodeURIComponent(query)}` : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [inputValue, submittedKeyword]);

  const resolveUrl = useCallback(() => {
    if (mapsUrlInput.trim() === '') return;
    resolveMutation.mutate(mapsUrlInput.trim(), {
      onSuccess: (resolved) => {
        if (resolved.latitude !== null && resolved.longitude !== null) {
          setCoordinates({ latitude: resolved.latitude, longitude: resolved.longitude });
          setMapSeed((seed) => seed + 1);
        }
        if (resolved.suggestedName !== null && name.trim() === '') {
          setName(resolved.suggestedName);
        }
      },
    });
  }, [mapsUrlInput, resolveMutation, name]);

  // Dragging fine-tunes the pin without bumping mapSeed — remounting the map
  // on every drag would fight the user's own drag gesture.
  const movePin = useCallback((latitude: number, longitude: number) => {
    setCoordinates({ latitude, longitude });
  }, []);

  const canSave = name.trim() !== '';

  const saveNewLocation = useCallback(() => {
    if (!canSave) return;
    createMutation.mutate(
      {
        sportId,
        name: name.trim(),
        address: address.trim() !== '' ? address.trim() : undefined,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        sourceMapsUrl: mapsUrlInput.trim() !== '' ? mapsUrlInput.trim() : undefined,
      },
      {
        onSuccess: (created) => {
          onSelect(created);
          onClose();
        },
      },
    );
  }, [canSave, createMutation, sportId, name, address, coordinates, mapsUrlInput, onSelect, onClose]);

  const selectResult = useCallback(
    (location: Location) => {
      onSelect(location);
      onClose();
    },
    [onSelect, onClose],
  );

  // Field names match LocationPickerProps 1:1 (mostly aliases of the local state/callbacks
  // above) so every caller can spread this return value directly into <LocationPicker />.
  return {
    mode,
    onSwitchToCreate: switchToCreate,
    onSwitchToSearch: switchToSearch,

    inputValue,
    onInputChange: setInputValue,
    onSearch: submitSearch,
    results: searchQuery.data?.content ?? [],
    isSearching: searchQuery.isLoading,
    isSearchError: searchQuery.isError,
    onSelectResult: selectResult,

    onOpenGoogleMaps: openGoogleMaps,
    mapsUrlInput,
    onMapsUrlChange: setMapsUrlInput,
    onResolveUrl: resolveUrl,
    isResolving: resolveMutation.isPending,
    isResolveError: resolveMutation.isError,
    resolvedNoCoordinates:
      resolveMutation.isSuccess &&
      resolveMutation.data.latitude === null &&
      resolveMutation.data.longitude === null,
    coordinates,
    mapSeed,
    onMovePin: movePin,
    name,
    onNameChange: setName,
    address,
    onAddressChange: setAddress,
    canSave,
    onSave: saveNewLocation,
    isSaving: createMutation.isPending,
    isSaveError: createMutation.isError,
  };
}
