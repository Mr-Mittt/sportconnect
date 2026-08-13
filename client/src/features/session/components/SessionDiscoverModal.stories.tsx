import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDiscoverModal } from './SessionDiscoverModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

function makeLocation(name: string): Location {
  return {
    id: 1,
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

function makeSession(overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id'>): SessionListItem {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Weekend 5-a-side',
    description: null,
    location: makeLocation('Riverside Courts'),
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 3,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

const meta = {
  title: 'Session/SessionDiscoverModal',
  component: SessionDiscoverModal,
  args: {
    isOpen: true,
    onClose: () => {},
    searchMode: 'sessions',
    onSearchModeChange: () => {},
    searchText: '',
    onSearchTextChange: () => {},
    sportsByKey,
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
    isLoading: false,
    isError: false,
    availableSports: [],
    onAddSport: () => {},
    isAddingSport: false,
    isAddSportError: false,
  },
} satisfies Meta<typeof SessionDiscoverModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithResults: Story = {
  args: {
    sessions: [
      makeSession({ id: 1, title: 'Weekend 5-a-side' }),
      makeSession({ id: 2, title: 'Sunday pickup run', sportId: 5, sportName: 'Football' }),
    ],
  },
};

export const Empty: Story = {
  args: { sessions: [] },
};

export const Loading: Story = {
  args: { sessions: [], isLoading: true },
};

/** CLIENT-SESSION-7 follow-up: zero sport profiles — the Discover panel is replaced by the
 * inline "add a sport first" prompt, staying on this same Dialog instead of opening a second one. */
export const NoSportProfilesYet: Story = {
  args: {
    sportsByKey: {} as Record<SportKey, SportProfile>,
    sessions: [],
    availableSports: Object.keys(sportsByKey),
  },
};
