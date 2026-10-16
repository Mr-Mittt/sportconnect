import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { apiClient } from '@/app/apiClient';
import type { UserResponse } from '@/features/profile/types';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { CompleteProfileDialog } from './CompleteProfileDialog';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const hanoi: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' };

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

/** Same `apiClient`-mocking approach as `AccountSettingsModal.stories.tsx` (no msw-storybook-addon in this repo). */
function mockGet(url: string): { data: unknown } {
  if (url === '/reference/languages') return apiResponse(languages);
  if (url === '/reference/countries') return apiResponse([vietnam]);
  if (url.startsWith('/reference/countries/')) return apiResponse([hanoi]);
  throw new globalThis.Error(`unexpected GET ${url}`);
}
apiClient.get = (async (url: string) => mockGet(url)) as typeof apiClient.get;
apiClient.post = (async () =>
  apiResponse({ language: null, country: null, region: null, source: null })) as typeof apiClient.post;

const newUser: UserResponse = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: null,
  phoneNumber: null,
  dateOfBirth: null,
  gender: null,
  bio: null,
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: null,
  country: null,
  countryId: null,
  regionId: null,
  regionName: null,
  heightCm: null,
  weightKg: null,
  shoeSizeMm: null,
  isEmailVerified: true,
  isActive: true,
  roles: ['USER'],
  createdAt: '2026-01-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Jordan Lee',
} as UserResponse;

/**
 * AUTH-16: the "complete your profile" dialog for a user with no country (a first-time social
 * sign-in) or a country without a region (a value dropped at the first sign-in).
 */
const meta = {
  title: 'Shared/CompleteProfileDialog',
  component: CompleteProfileDialog,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    isOpen: true,
    user: newUser,
    languageCode: null,
    onSave: () => {},
    onSkip: () => {},
    isSaving: false,
    errorMessage: null,
  },
} satisfies Meta<typeof CompleteProfileDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing chosen yet: Save is disabled until a country is picked. */
export const Default: Story = {};

/** The country is known, only the region is missing. */
export const RegionMissing: Story = {
  args: { user: { ...newUser, countryId: 1 } },
};

export const Saving: Story = { args: { isSaving: true } };

export const SaveFailed: Story = {
  args: { errorMessage: 'We could not save your profile. Try again.' },
};
