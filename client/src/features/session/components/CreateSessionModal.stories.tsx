import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FriendUser } from '@/features/friends/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

// CLIENT-SESSION-4: the "Invite your friend" field's own client-side filter over this list —
// enough rows here to demo the 3+ character search actually narrowing results in Storybook.
const friends: FriendUser[] = [
  { id: 'friend-1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null },
  { id: 'friend-2', fullName: 'Priyanka Rao', avatarUrl: null, coverUrl: null, bio: null },
  { id: 'friend-3', fullName: 'Jordan Lee', avatarUrl: null, coverUrl: null, bio: null },
];

// Real usage builds this from a partial API result via Object.fromEntries + a cast (see
// useMatchesPageData.ts/HomeFeedPage.tsx) — the single-sport-profile stories below mirror a
// caller who genuinely only has one, not all three keys.
const soleFootballSport = { football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' } } as Record<SportKey, SportProfile>;

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: '12 River Rd',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

// CLIENT-SESSION-5: populates the location field's favorites dropdown.
const favoriteLocations: Location[] = [
  location,
  { ...location, id: 2, name: 'Lakeside Courts', address: '4 Lake Rd' },
];

const locationPicker: LocationPickerProps = {
  isOpen: false,
  onClose: () => {},
  mode: 'search',
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  favoriteLocationIds: new Set<number>(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

const meta = {
  title: 'Session/CreateSessionModal',
  component: CreateSessionModal,
  args: {
    isOpen: true,
    onClose: () => {},
    sportsByKey,
    selectedLocation: null,
    onOpenLocationPicker: () => {},
    locationPicker,
    onEffectiveSportChange: () => {},
    favoriteLocations,
    isFavoriteLocationsLoading: false,
    onSelectLocation: () => {},
    friends,
    isFriendsLoading: false,
    onSubmit: () => {},
    isSubmitting: false,
    isError: false,
    availableSports: [],
    onAddSport: () => {},
    isAddingSport: false,
    isAddSportError: false,
  },
} satisfies Meta<typeof CreateSessionModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No `activeSport` and more than one sport profile — prefills the first one (`sportsByKey`'s
 * own order, "football" here). */
export const Default: Story = {};

/** `activeSport` set to a real sport pre-selects the Sport field. */
export const SportPreselectedFromActivePill: Story = {
  args: { activeSport: 'basketball' },
};

/** Only one sport profile at all pre-selects it regardless of `activeSport`. */
export const SportPreselectedFromSoleProfile: Story = {
  args: {
    sportsByKey: soleFootballSport,
    activeSport: 'all',
  },
};

export const LocationChosen: Story = {
  args: { activeSport: 'basketball', selectedLocation: location },
};

export const Submitting: Story = {
  args: { activeSport: 'basketball', selectedLocation: location, isSubmitting: true },
};

export const SubmitError: Story = {
  args: { activeSport: 'basketball', selectedLocation: location, isError: true },
};

/** CLIENT-SESSION-5: the location field's favorites dropdown with no favorites for this sport yet. */
export const NoFavoriteLocationsYet: Story = {
  args: { activeSport: 'basketball', favoriteLocations: [] },
};

/** CLIENT-SESSION-7 follow-up: zero sport profiles — the whole form is replaced by the inline
 * "add a sport first" prompt, staying on this same Dialog instead of opening a second one. */
export const NoSportProfilesYet: Story = {
  args: {
    sportsByKey: {} as Record<SportKey, SportProfile>,
    availableSports: Object.keys(sportsByKey),
  },
};
