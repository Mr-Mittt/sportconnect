import { IconChevronDown, IconX } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { Location } from '@/shared/types/location';

interface DiscoverLocationFilterProps {
  /** `false` when the hosting page's sport pill is 'all' — both `GET /locations/favorites` and
   * `GET /locations/search` require one specific sport (LOC-1). */
  isAvailable: boolean;
  selectedLocations: Location[];
  onToggleLocation: (location: Location) => void;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  searchResults: Location[];
  isSearchLoading: boolean;
}

function LocationRow({
  location,
  checked,
  onToggle,
}: {
  location: Location;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2sm text-text-primary hover:bg-surface-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 accent-accent-solid"
      />
      {location.name}
    </label>
  );
}

/**
 * CLIENT-SESSION-22's Location filter — a favorites checklist (`useFavoriteLocations`, CLIENT-
 * SESSION-5's own list, reused) plus a typeahead search (`useLocationSearch`, CLIENT-LOC-1's
 * `LocationPicker` search reused) so the caller can also filter by any location, not just a
 * favorited one — reverses this ticket's own original "no new location-search UI" framing, since
 * both hooks already existed and no new backend endpoint was needed. Multiple selections are
 * OR-combined server-side (`locationId` repeated param). Same `Popover`-is-safe-inside-a-Dialog
 * reasoning as `DiscoverDatePicker`.
 */
export function DiscoverLocationFilter({
  isAvailable,
  selectedLocations,
  onToggleLocation,
  favoriteLocations,
  isFavoriteLocationsLoading,
  searchText,
  onSearchTextChange,
  searchResults,
  isSearchLoading,
}: DiscoverLocationFilterProps) {
  if (!isAvailable) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title="Pick a specific sport to filter by location"
        className="border-hairline cursor-not-allowed rounded-full border-border bg-surface-1 px-3 py-1.5 text-xs text-text-secondary"
      >
        Location
      </button>
    );
  }

  const selectedIds = new Set(selectedLocations.map((location) => location.id));
  const trimmedSearch = searchText.trim();
  const rows = trimmedSearch === '' ? favoriteLocations : searchResults;
  const isLoadingRows = trimmedSearch === '' ? isFavoriteLocationsLoading : isSearchLoading;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          Location{selectedLocations.length > 0 ? ` (${selectedLocations.length})` : ''}
          <IconChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          {selectedLocations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedLocations.map((location) => (
                <span
                  key={location.id}
                  className="flex items-center gap-1 rounded-full bg-surface-1 py-1 pr-1.5 pl-2.5 text-2xs font-medium text-text-primary"
                >
                  {location.name}
                  <button
                    type="button"
                    onClick={() => onToggleLocation(location)}
                    aria-label={`Remove ${location.name}`}
                    className="flex size-4 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text-primary"
                  >
                    <IconX className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Search locations…"
            aria-label="Search locations"
          />
          {isLoadingRows ? (
            <p className="px-2 py-1.5 text-2xs text-text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-1.5 text-2xs text-text-muted">
              {trimmedSearch === '' ? 'No favorites yet.' : 'No locations found.'}
            </p>
          ) : (
            <fieldset className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              <legend className="sr-only">Locations to discover</legend>
              {rows.map((location) => (
                <LocationRow
                  key={location.id}
                  location={location}
                  checked={selectedIds.has(location.id)}
                  onToggle={() => onToggleLocation(location)}
                />
              ))}
            </fieldset>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
