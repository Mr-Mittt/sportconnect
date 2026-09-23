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

const renderFilter = (overrides: Partial<React.ComponentProps<typeof DiscoverLocationFilter>> = {}) =>
  render(
    <DiscoverLocationFilter
      isAvailable
      selectedLocations={[]}
      onToggleLocation={() => {}}
      favoriteLocations={[riverside, downtown]}
      isFavoriteLocationsLoading={false}
      searchText=""
      onSearchTextChange={() => {}}
      searchResults={[]}
      isSearchLoading={false}
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

  it('shows selected locations as removable chips, and reports removal via onToggleLocation', async () => {
    const user = userEvent.setup();
    const onToggleLocation = vi.fn();
    renderFilter({ selectedLocations: [riverside], onToggleLocation });

    await user.click(screen.getByRole('button', { name: 'Location (1)' }));
    expect(screen.getByRole('button', { name: 'Remove Riverside Courts' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Riverside Courts' }));
    expect(onToggleLocation).toHaveBeenCalledWith(riverside);
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
});
