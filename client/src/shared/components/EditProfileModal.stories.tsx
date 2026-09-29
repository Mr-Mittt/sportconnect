import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { apiClient } from '@/app/apiClient';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import type { UserResponse } from '@/features/profile/types';
import { EditProfileModal } from './EditProfileModal';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const countries: CountryResponse[] = [vietnam];
const hanoi: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' };
const regions: RegionResponse[] = [hanoi];

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

/**
 * CLIENT-REF-3: `EditProfileModal` now wires `useGeoLocaleFieldsData()` itself (real TanStack
 * Query hooks) — same `apiClient`-mocking approach `RegisterForm.stories.tsx` established (no
 * `msw-storybook-addon` wired into this repo's `.storybook/`).
 */
function mockGet(url: string): { data: unknown } {
  if (url === '/reference/languages') return apiResponse(languages);
  if (url === '/reference/countries') return apiResponse(countries);
  if (url.startsWith('/reference/countries/')) return apiResponse(regions);
  throw new globalThis.Error(`unexpected GET ${url}`);
}
apiClient.get = (async (url: string) => mockGet(url)) as typeof apiClient.get;
apiClient.post = (async () =>
  apiResponse({ language: null, country: null, region: null, source: null })) as typeof apiClient.post;

const baseUser: UserResponse = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: '0123456789',
  dateOfBirth: '1995-06-12',
  gender: 'Female',
  bio: 'Weekend baller, always up for a pickup game.',
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: 'Hanoi',
  country: 'Vietnam',
  countryId: 1,
  regionId: 101,
  regionName: 'Hanoi',
  heightCm: 170,
  weightKg: 62,
  shoeSizeCm: 24,
  isEmailVerified: true,
  isActive: true,
  roles: ['USER'],
  createdAt: '2026-01-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Jordan Lee',
};

const meta = {
  title: 'Shared/EditProfileModal',
  component: EditProfileModal,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: () => {},
    user: baseUser,
    languageCode: 'vi',
    onSave: () => {},
    isSaving: false,
    errorMessage: null,
  },
} satisfies Meta<typeof EditProfileModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every optional field unset — the empty-state layout, including no Country/Region/Language
 * chosen yet (CLIENT-REF-3). */
export const EmptyProfile: Story = {
  args: {
    user: {
      ...baseUser,
      firstName: null,
      lastName: null,
      username: null,
      phoneNumber: null,
      dateOfBirth: null,
      gender: null,
      bio: null,
      city: null,
      country: null,
      countryId: null,
      regionId: null,
      regionName: null,
      heightCm: null,
      weightKg: null,
      shoeSizeCm: null,
    },
    languageCode: null,
  },
};

/** CLIENT-REF-3: `countryId` is `null` but `country` still holds old free text — the legacy hint
 * renders above the (empty) Country select. */
export const LegacyUnmatchedCountry: Story = {
  args: {
    user: { ...baseUser, country: 'USA', countryId: null, regionId: null, regionName: null },
  },
};

export const Saving: Story = {
  args: { isSaving: true },
};

export const ErrorState: Story = {
  args: { errorMessage: 'Username must be between 3 and 50 characters' },
};
