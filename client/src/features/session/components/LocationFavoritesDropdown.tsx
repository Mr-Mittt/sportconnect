import type { Location } from '@/shared/types/location';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface LocationFavoritesDropdownProps {
  selectedLocation: Location | null;
  favorites: Location[];
  isFavoritesLoading: boolean;
  disabled: boolean;
  onSelectFavorite: (location: Location) => void;
  onOpenLocationPicker: () => void;
}

/** CLIENT-SESSION-5's favorites-aware location selector — a real Radix `DropdownMenu`, not the
 * plain "Choose location" button CLIENT-SESSION-1/2 shipped. `modal={false}` is required: a
 * default-modal DropdownMenu nested inside a Dialog calls the same `hideOthers()` mechanism the
 * Dialog itself uses, aria-hiding the *entire parent Dialog* (confirmed live via a real browser
 * test — the Dialog's `aria-hidden` flipped to `"true"` the instant the menu opened, and
 * `getByRole('dialog')` dropped from 1 match to 0) since the menu's portal is a DOM sibling of the
 * Dialog's, not a descendant. `modal={false}` skips that entirely while every other behavior
 * (Escape/outside-click dismiss, keyboard nav) still works, also verified live. Rows are
 * select-only (user decision) — unfavoriting stays a `LocationPicker`-search-results-only action
 * via the heart icon there.
 *
 * CLIENT-SESSION-23: extracted from `CreateSessionModal.tsx` (same "extract for reuse" precedent
 * as `FeeTypeFields`, CLIENT-SESSION-21) so `SessionPreparingCompletion` — which lives inside
 * `SessionDetailModal`'s Dialog, so the `modal={false}` rule above applies identically — shares
 * one implementation instead of growing a second favorites dropdown. Behavior unchanged. */
export function LocationFavoritesDropdown({
  selectedLocation,
  favorites,
  isFavoritesLoading,
  disabled,
  onSelectFavorite,
  onOpenLocationPicker,
}: LocationFavoritesDropdownProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={disabled}>
          {selectedLocation === null ? 'Choose location' : 'Change location'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {isFavoritesLoading ? (
          <p className="px-2 py-2 text-2xs text-text-muted">Loading…</p>
        ) : favorites.length === 0 ? (
          <p className="px-2 py-2 text-2xs text-text-muted">No favorites yet.</p>
        ) : (
          favorites.map((location) => (
            <DropdownMenuItem key={location.id} onSelect={() => onSelectFavorite(location)}>
              {location.name}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenLocationPicker}>Choose a location…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
