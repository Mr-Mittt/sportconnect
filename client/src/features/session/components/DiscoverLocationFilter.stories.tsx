import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta = {
  title: 'Session/DiscoverLocationFilter',
  component: DiscoverLocationFilter,
  args: {
    isAvailable: true,
    onToggleLocation: () => {},
    onSearchTextChange: () => {},
    favoriteLocations: [riverside, downtown],
    isFavoriteLocationsLoading: false,
    searchResults: [],
    isSearchLoading: false,
  },
} satisfies Meta<typeof DiscoverLocationFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoneSelected: Story = {
  args: { selectedLocations: [], searchText: '' },
};

export const OneSelected: Story = {
  args: { selectedLocations: [riverside], searchText: '' },
};

export const SearchResults: Story = {
  args: { selectedLocations: [], searchText: 'downtown', searchResults: [downtown] },
};

export const NoFavoritesYet: Story = {
  args: { selectedLocations: [], searchText: '', favoriteLocations: [] },
};

export const Unavailable: Story = {
  args: { isAvailable: false, selectedLocations: [], searchText: '' },
};
