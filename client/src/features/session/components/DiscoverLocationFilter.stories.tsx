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
const longName = makeLocation(
  3,
  'The Grand Community Sports & Recreation Centre — West Wing Badminton Courts',
);

const meta = {
  title: 'Session/DiscoverLocationFilter',
  component: DiscoverLocationFilter,
  args: {
    isAvailable: true,
    onToggleLocation: () => {},
    onClearLocationFilter: () => {},
    onSearchTextChange: () => {},
    favoriteLocations: [riverside, downtown],
    isFavoriteLocationsLoading: false,
    searchResults: [],
    isSearchLoading: false,
    onOpenLocationPicker: () => {},
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

// 2026-09-23 revision — a long name truncates to one line, full name on hover via `title`.
export const LongLocationName: Story = {
  args: {
    selectedLocations: [],
    searchText: '',
    favoriteLocations: [longName, riverside],
  },
};

// 2026-09-23 (second revision) — a location chosen via "Choose a location…" that isn't already a
// favorite still shows up, checked, in the checklist (same "selected-but-not-in-the-base-list
// still renders" precedent DiscoverDatePicker's own customDates uses).
const chosenViaPicker = makeLocation(4, 'Lakeside Sports Hall');
export const ChosenLocationNotFavorited: Story = {
  args: {
    selectedLocations: [chosenViaPicker],
    searchText: '',
    favoriteLocations: [riverside, downtown],
  },
};
