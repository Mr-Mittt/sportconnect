import { Popover, PopoverContent } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { Location } from '@/shared/types/location';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';

interface DiscoverLocationFilterProps {
  /** `false` when the hosting page's sport pill is 'all' — both `GET /locations/favorites` and
   * `GET /locations/search` require one specific sport (LOC-1). */
  isAvailable: boolean;
  selectedLocations: Location[];
  onToggleLocation: (location: Location) => void;
  /** Clears every selection at once — the filter pill's own reset "x" (2026-09-23 revision). */
  onClearLocationFilter: () => void;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  searchResults: Location[];
  isSearchLoading: boolean;
  /** CLIENT-SESSION-29 — opens the full `LocationPicker` Dialog (search + "Add a new location"),
   * same "Choose a location…" precedent `CreateSessionModal`'s `LocationFavoritesDropdown`
   * already established. Selecting a result there calls the parent's `selectLocation` (dedup —
   * never toggles an already-checked row off), not `onToggleLocation`. */
  onOpenLocationPicker: () => void;
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
    <label
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2sm text-text-primary hover:bg-surface-1"
      title={location.name}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 shrink-0 accent-accent-solid"
      />
      <span className="min-w-0 truncate">{location.name}</span>
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
  onClearLocationFilter,
  favoriteLocations,
  isFavoriteLocationsLoading,
  searchText,
  onSearchTextChange,
  searchResults,
  isSearchLoading,
  onOpenLocationPicker,
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
  const favoriteIds = new Set(favoriteLocations.map((location) => location.id));
  // 2026-09-23 revision — a location chosen via "Choose a location…" that isn't already a
  // favorite still needs to show up (checked) in this checklist, same "selected-but-not-in-the-
  // base-list still renders" precedent DiscoverDatePicker's own customDates already established.
  const chosenNotFavorited = selectedLocations.filter((location) => !favoriteIds.has(location.id));
  const rows =
    trimmedSearch === '' ? [...favoriteLocations, ...chosenNotFavorited] : searchResults;
  const isLoadingRows = trimmedSearch === '' ? isFavoriteLocationsLoading : isSearchLoading;

  return (
    <Popover>
      <DiscoverFilterTrigger
        label={`Location${selectedLocations.length > 0 ? ` (${selectedLocations.length})` : ''}`}
        isActive={selectedLocations.length > 0}
        onClear={onClearLocationFilter}
        clearLabel="Clear location filter"
      />
      <PopoverContent align="start" className="w-72">
        {/* No selected-locations chip row (2026-09-23 revision) — the checklist below already
          shows selection via its own checkboxes; repeating it as removable chips was redundant. */}
        <div className="flex flex-col gap-2">
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
            <fieldset className="flex min-w-0 max-h-48 flex-col gap-0.5 overflow-y-auto">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer justify-start"
            onClick={onOpenLocationPicker}
          >
            Choose a location…
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
