import { IconArrowLeft, IconExternalLink, IconHeart, IconMapPin, IconSearch } from '@tabler/icons-react';
import type { Location } from '../types';
import type { LocationPickerMode } from '../useLocationPickerData';
import { directionsUrl } from '@/shared/lib/mapsLinks';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { LocationMapPreview } from './LocationMapPreview';

export interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;

  mode: LocationPickerMode;
  onSwitchToCreate: () => void;
  onSwitchToSearch: () => void;

  inputValue: string;
  onInputChange: (value: string) => void;
  onSearch: () => void;
  results: Location[];
  isSearching: boolean;
  isSearchError: boolean;
  onSelectResult: (location: Location) => void;
  /** CLIENT-SESSION-5: which of `results` the caller has already favorited — `LocationResponse`
   * carries no `isFavorite` flag itself, so the parent derives this set from a separate
   * favorites-list query. */
  favoriteLocationIds: Set<number>;
  onToggleFavorite: (location: Location) => void;
  isTogglingFavorite: boolean;

  onOpenGoogleMaps: () => void;
  mapsUrlInput: string;
  onMapsUrlChange: (value: string) => void;
  onResolveUrl: () => void;
  isResolving: boolean;
  isResolveError: boolean;
  resolvedNoCoordinates: boolean;
  coordinates: { latitude: number; longitude: number } | null;
  mapSeed: number;
  onMovePin: (latitude: number, longitude: number) => void;

  name: string;
  onNameChange: (value: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
  canSave: boolean;
  onSave: () => void;
  isSaving: boolean;
  isSaveError: boolean;
}

/**
 * CLIENT-LOC-1's shared location-picking widget — search the sport-scoped shared directory,
 * or add a new venue via a pasted Google Maps link (no paid/keyed map API anywhere, per
 * `documentation/md/SESSION_LOCATION_DESIGN.md`). Purely presentational and controlled per
 * `client/CLAUDE.md` — all state and mutations come from the parent's `useLocationPickerData()`
 * hook, so this stays Storybook-testable without a TanStack Query provider (same shape as
 * `JoinGroupModal`/`useJoinGroupModalData`).
 *
 * Search mode mirrors `JoinGroupModal`: a submit-triggered `Input` + result rows, not a
 * live-as-you-type Combobox (no `Command`/`cmdk` primitive exists in this codebase yet).
 * Create mode: "Find on Google Maps" link-out, paste-the-link-back field, an OSM/Leaflet
 * preview pin once coordinates are known (draggable to fine-tune), and editable name/address
 * fields. A resolve that comes back with no coordinates (`resolvedNoCoordinates`) is not an
 * error — it falls back to manual name-only entry, matching the backend's own
 * graceful-degradation contract.
 *
 * Selecting a result or saving a new location closes the dialog itself (owned by the hook) —
 * picking a location is this widget's one job.
 */
export function LocationPicker({
  isOpen,
  onClose,
  mode,
  onSwitchToCreate,
  onSwitchToSearch,
  inputValue,
  onInputChange,
  onSearch,
  results,
  isSearching,
  isSearchError,
  onSelectResult,
  favoriteLocationIds,
  onToggleFavorite,
  isTogglingFavorite,
  onOpenGoogleMaps,
  mapsUrlInput,
  onMapsUrlChange,
  onResolveUrl,
  isResolving,
  isResolveError,
  resolvedNoCoordinates,
  coordinates,
  mapSeed,
  onMovePin,
  name,
  onNameChange,
  address,
  onAddressChange,
  canSave,
  onSave,
  isSaving,
  isSaveError,
}: LocationPickerProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fixedHeight>
        <DialogHeader
          title={mode === 'search' ? 'Choose a location' : 'Add a new location'}
          className="border-hairline-b border-border px-4 py-3"
        />
        {mode === 'search' ? (
          <>
            <div className="border-hairline-b flex items-center gap-2 border-border px-4 py-3">
              <Input
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch();
                }}
                placeholder="Search locations by name…"
                aria-label="Search locations"
              />
              <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={onSearch}>
                <IconSearch className="size-4" aria-hidden="true" />
                Search
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isSearching && <p className="text-2sm text-text-muted">Searching…</p>}
              {isSearchError && <p className="text-2sm text-text-danger">Couldn't load locations.</p>}
              {!isSearching && !isSearchError && results.length === 0 && (
                <p className="text-2sm text-text-muted">No locations found.</p>
              )}
              <div className="flex flex-col gap-2.5">
                {results.map((location) => {
                  const isFavorited = favoriteLocationIds.has(location.id);
                  return (
                    <div key={location.id} className="border-hairline flex items-center gap-1 rounded-lg border-border">
                      <button
                        type="button"
                        onClick={() => onSelectResult(location)}
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 p-2.5 text-left transition-colors hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                      >
                        <span className="text-sm font-medium text-text-primary">{location.name}</span>
                        {location.address !== null && (
                          <span className="text-2xs text-text-muted">{location.address}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isTogglingFavorite}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite(location);
                        }}
                        aria-label={isFavorited ? `Unfavorite ${location.name}` : `Favorite ${location.name}`}
                        aria-pressed={isFavorited}
                        className="mr-2 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-1 hover:text-text-danger disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                      >
                        <IconHeart
                          className={cn('size-4', isFavorited && 'fill-text-danger text-text-danger')}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-hairline-t flex justify-center border-border px-4 py-3">
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={onSwitchToCreate}>
                Can't find it? Add a new location
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <button
              type="button"
              onClick={onSwitchToSearch}
              className="mb-3 flex items-center gap-1 text-2sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <IconArrowLeft className="size-4" aria-hidden="true" />
              Back to search
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mb-3 w-full cursor-pointer"
              onClick={onOpenGoogleMaps}
            >
              <IconExternalLink className="size-4" aria-hidden="true" />
              Find on Google Maps
            </Button>

            <Label htmlFor="location-maps-url">Paste the share link</Label>
            <div className="mb-3 flex items-center gap-2">
              <Input
                id="location-maps-url"
                value={mapsUrlInput}
                onChange={(event) => onMapsUrlChange(event.target.value)}
                placeholder="https://maps.app.goo.gl/…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 cursor-pointer"
                disabled={isResolving || mapsUrlInput.trim() === ''}
                onClick={onResolveUrl}
              >
                {isResolving ? 'Resolving…' : 'Resolve'}
              </Button>
            </div>
            {isResolveError && (
              <p role="alert" className="mb-3 text-2sm text-text-danger">
                Couldn't resolve that link. Try a different one, or enter the details manually below.
              </p>
            )}
            {resolvedNoCoordinates && (
              <p className="mb-3 text-2sm text-text-muted">
                Couldn't detect coordinates from that link — enter the location details manually below.
              </p>
            )}

            {coordinates !== null && (
              <div className="mb-3 flex flex-col gap-2">
                <LocationMapPreview
                  latitude={coordinates.latitude}
                  longitude={coordinates.longitude}
                  onMove={onMovePin}
                  mapSeed={mapSeed}
                />
                <a
                  href={directionsUrl(coordinates.latitude, coordinates.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-fit items-center gap-1 text-2sm text-text-accent hover:underline"
                >
                  <IconMapPin className="size-4" aria-hidden="true" />
                  Get Directions
                </a>
              </div>
            )}

            <Label htmlFor="location-name">Name</Label>
            <Input
              id="location-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Riverside Sports Complex"
              className="mb-3"
            />

            <Label htmlFor="location-address">Address (optional)</Label>
            <Input
              id="location-address"
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder="e.g. 123 Main St"
              className="mb-3"
            />

            {isSaveError && (
              <p role="alert" className="mb-3 text-2sm text-text-danger">
                Couldn't save this location. Try again.
              </p>
            )}

            <Button
              type="button"
              variant="primary"
              className="w-full"
              disabled={!canSave || isSaving}
              onClick={onSave}
            >
              {isSaving ? 'Saving…' : 'Save & Use This Location'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
