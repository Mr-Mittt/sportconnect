import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { apiClient } from '@/app/apiClient';
import type { CountryResponse, LanguageResponse, RegionResponse, ResolvedGeoResponse } from '@/shared/types/reference';
import { RegisterForm } from './RegisterForm';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];
const hcmc: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };
const allNull: ResolvedGeoResponse = { language: null, country: null, region: null, source: null };

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

/**
 * No `msw-storybook-addon` is wired into this repo's `.storybook/` (per CLIENT-REF-1/PROFILE-6
 * precedent — every other real-data-hook `.stories.tsx` mocks `apiClient` directly instead), so
 * `RegisterForm` (which now wires `useGeoLocaleFieldsData()` itself) does the same: a
 * module-scope fixture map replaces `apiClient.get`/`.post`, reassigned once since Storybook
 * renders one canvas at a time.
 */
function mockGet(url: string): { data: unknown } {
  if (url === '/reference/languages') return apiResponse(languages);
  if (url === '/reference/countries') return apiResponse(countries);
  if (url.startsWith('/reference/countries/')) return apiResponse([hcmc]);
  // `globalThis.Error`, not the bare global — this module also exports an `Error` story below,
  // and a module-scope `const` shadows the builtin name for the whole file, hoisting included.
  throw new globalThis.Error(`unexpected GET ${url}`);
}
apiClient.get = (async (url: string) => mockGet(url)) as typeof apiClient.get;
apiClient.post = (async () => apiResponse(allNull)) as typeof apiClient.post;

const meta = {
  title: 'Auth/RegisterForm',
  component: RegisterForm,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
  args: {
    onSubmit: () => {},
    isPending: false,
    errorMessage: null,
  },
} satisfies Meta<typeof RegisterForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: () => {
    apiClient.post = (async () => apiResponse(allNull)) as typeof apiClient.post;
  },
};

export const Submitting: Story = {
  args: { isPending: true },
};

export const Error: Story = {
  args: { errorMessage: 'Something went wrong on our side. Try again.' },
};

/** CLIENT-ERR-2: a 409 EMAIL_ALREADY_REGISTERED — localized copy plus the "Sign in instead" link. */
export const DuplicateEmail: Story = {
  args: { errorMessage: 'An account with this email already exists.', errorCode: 'EMAIL_ALREADY_REGISTERED' },
};

/** CLIENT-ERR-2: a 400 VALIDATION_FAILED — generic line plus the failed fields named with the form's labels. */
export const ValidationFailed: Story = {
  args: {
    errorMessage: 'Some of the information you entered isn’t valid. Check the form and try again.',
    errorCode: 'VALIDATION_FAILED',
    errorFields: ['password', 'fullName'],
  },
};

/** The silent mount resolve pre-fills Language/Country/Region from a coordinates-shaped result —
 * reviews the composed layout with the geo section filled in, not just GeoLocaleFields in
 * isolation (its own Storybook file already covers every one of its individual visual states:
 * resolving, denied, no-regions-country, reference-load-error). */
export const PreFilled: Story = {
  beforeEach: () => {
    apiClient.post = (async () =>
      apiResponse({ language: languages[1], country: vietnam, region: hcmc, source: 'COORDINATES' })) as typeof apiClient.post;
  },
};

/**
 * `noValidate` custom validation (2026-09-28 fix — see the component's own doc comment): clicking
 * "Create account" with every required field empty reveals translated inline messages beside each
 * label instead of the browser's own untranslatable popups.
 */
export const InvalidSubmit: Story = {
  beforeEach: () => {
    apiClient.post = (async () => apiResponse(allNull)) as typeof apiClient.post;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(canvas.getByText('Email is required.')).toBeInTheDocument();
    await expect(canvas.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    await expect(canvas.getByText('Full name is required.')).toBeInTheDocument();
  },
};
