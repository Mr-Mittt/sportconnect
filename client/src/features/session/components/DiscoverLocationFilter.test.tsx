import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Location } from '@/shared/types/location';
import { DiscoverLocationFilter } from './DiscoverLocationFilter';

function makeLocation(id: number, name: string): Location {
  return {
    id,
    sportId: 6,
    sportName: 'Basketball',
    name,
    address: null,
    latitude: null,
    longitude: null,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  };
}

const riverside = makeLocation(1, 'Riverside Courts');
const downtown = makeLocation(2, 'Downtown Turf');

const renderFilter = (
  overrides: Partial<React.ComponentProps<typeof DiscoverLocationFilter>> = {},
) =>
  render(
    <DiscoverLocationFilter
      isAvailable
      selectedLocations={[]}
      onToggleLocation={() => {}}
      onClearLocationFilter={() => {}}
      favoriteLocations={[riverside, downtown]}
      isFavoriteLocationsLoading={false}
      searchText=""
      onSearchTextChange={() => {}}
      searchResults={[]}
      isSearchLoading={false}
      onOpenLocationPicker={() => {}}
      {...overrides}
    />,
  );

describe('DiscoverLocationFilter', () => {
  it('renders disabled with a tooltip when unavailable', () => {
    renderFilter({ isAvailable: false });
    const button = screen.getByRole('button', { name: 'Location' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', 'Pick a specific sport to filter by location');
  });

  it('shows the favorites checklist by default', async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole('button', { name: 'Location' }));
    expect(screen.getByRole('checkbox', { name: 'Riverside Courts' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Downtown Turf' })).toBeInTheDocument();
  });

  it('reports the toggled favorite location', async () => {
    const user = userEvent.setup();
    const onToggleLocation = vi.fn();
    renderFilter({ onToggleLocation });

    await user.click(screen.getByRole('button', { name: 'Location' }));
    await user.click(screen.getByRole('checkbox', { name: 'Riverside Courts' }));
    expect(onToggleLocation).toHaveBeenCalledWith(riverside);
  });

  // 2026-09-23 revision — no removable-chip row: the checklist's own checkboxes are the only
  // selection UI now (removing via the checklist is already covered above).
  it('checks the selected row and shows the count on the trigger, with no chip row', async () => {
    const user = userEvent.setup();
    renderFilter({ selectedLocations: [riverside] });

    await user.click(screen.getByRole('button', { name: 'Location (1)' }));
    expect(screen.getByRole('checkbox', { name: 'Riverside Courts' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Remove Riverside Courts' })).not.toBeInTheDocument();
  });

  it('each location row carries a title tooltip with its full name for truncation', async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole('button', { name: 'Location' }));
    expect(screen.getByRole('checkbox', { name: 'Riverside Courts' }).closest('label')).toHaveAttribute(
      'title',
      'Riverside Courts',
    );
  });

  it('switches to search results once a search query is typed', async () => {
    const user = userEvent.setup();
    renderFilter({ searchText: 'downtown', searchResults: [downtown] });

    await user.click(screen.getByRole('button', { name: 'Location' }));
    expect(screen.queryByRole('checkbox', { name: 'Riverside Courts' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Downtown Turf' })).toBeInTheDocument();
  });

  it('shows the empty-favorites copy when there are none', async () => {
    const user = userEvent.setup();
    renderFilter({ favoriteLocations: [] });

    await user.click(screen.getByRole('button', { name: 'Location' }));
    expect(screen.getByText('No favorites yet.')).toBeInTheDocument();
  });

  it('opens the LocationPicker via "Choose a location…"', async () => {
    const user = userEvent.setup();
    const onOpenLocationPicker = vi.fn();
    renderFilter({ onOpenLocationPicker });

    await user.click(screen.getByRole('button', { name: 'Location' }));
    await user.click(screen.getByRole('button', { name: 'Choose a location…' }));
    expect(onOpenLocationPicker).toHaveBeenCalled();
  });

  // 2026-09-23 (second revision) — a location chosen via "Choose a location…" that isn't already
  // a favorite still shows up, checked, in the checklist (same precedent DiscoverDatePicker's own
  // customDates already established for a checked-but-not-in-the-base-list value).
  it('shows a selected location not in favorites in the checklist too, checked', async () => {
    const user = userEvent.setup();
    const chosen = makeLocation(3, 'Lakeside Sports Hall');
    renderFilter({ selectedLocations: [chosen] });

    await user.click(screen.getByRole('button', { name: 'Location (1)' }));
    expect(screen.getByRole('checkbox', { name: 'Lakeside Sports Hall' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Riverside Courts' })).not.toBeChecked();
  });

  it('shows a reset "x" once a location is selected, clearing all via onClearLocationFilter', async () => {
    const user = userEvent.setup();
    const onClearLocationFilter = vi.fn();
    renderFilter({ selectedLocations: [riverside], onClearLocationFilter });

    await user.click(screen.getByRole('button', { name: 'Clear location filter' }));
    expect(onClearLocationFilter).toHaveBeenCalledTimes(1);
  });
});
