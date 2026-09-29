import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { MAX_BIO_LENGTH } from '@/features/profile/types';
import type { UserResponse } from '@/features/profile/types';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { EditProfileModal } from './EditProfileModal';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];
const hanoi: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' };
const hcmc: RegionResponse = { id: 102, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };
const regionsByCountry: Record<number, RegionResponse[]> = { 1: [hanoi, hcmc], 2: [] };

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}
const allNullResolve = apiResponse({ language: null, country: null, region: null, source: null });

/**
 * CLIENT-REF-3: `EditProfileModal` now wires `useGeoLocaleFieldsData()` itself (real TanStack
 * Query hooks), so rendering it for real needs a `QueryClientProvider` and the same
 * `apiClient`-mocking approach `RegisterForm.test.tsx` established — an all-null resolve keeps
 * every pre-existing assertion below unaffected (the geo fields render seeded from `user`/
 * `languageCode` props, untouched by the silent mount resolve).
 */
beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const path = url as string;
    if (path === '/reference/languages') return apiResponse(languages);
    if (path === '/reference/countries') return apiResponse(countries);
    const regionsMatch = /\/reference\/countries\/(\d+)\/regions/.exec(path);
    if (regionsMatch) return apiResponse(regionsByCountry[Number(regionsMatch[1])] ?? []);
    throw new Error(`unexpected GET ${path}`);
  });
  vi.spyOn(apiClient, 'post').mockResolvedValue(allNullResolve);
});

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function user(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 'user-1',
    email: 'jordan@example.com',
    firstName: 'Jordan',
    lastName: 'Lee',
    username: 'jordanlee',
    phoneNumber: null,
    dateOfBirth: null,
    gender: null,
    bio: 'Weekend baller.',
    avatarUrl: null,
    coverUrl: null,
    location: null,
    city: 'Hanoi',
    country: 'Vietnam',
    countryId: 1,
    regionId: 101,
    regionName: 'Hanoi',
    heightCm: null,
    weightKg: null,
    shoeSizeCm: null,
    isEmailVerified: true,
    isActive: true,
    roles: ['USER'],
    createdAt: '2026-01-01T00:00:00',
    lastLoginAt: null,
    fullName: 'Jordan Lee',
    ...overrides,
  };
}

describe('EditProfileModal', () => {
  it('renders seeded from the user prop, including the physical-stats fields', async () => {
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ phoneNumber: '0123456789', heightCm: 180, weightKg: 75, shoeSizeCm: 26 })}
        languageCode="vi"
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByLabelText('First name')).toHaveValue('Jordan');
    expect(screen.getByLabelText('Last name')).toHaveValue('Lee');
    expect(screen.getByLabelText('Username')).toHaveValue('jordanlee');
    expect(screen.getByLabelText('Bio')).toHaveValue('Weekend baller.');
    // Options render only once the mocked reference GETs resolve.
    await waitFor(() => expect(screen.getByLabelText('Country')).toHaveValue('1'));
    await waitFor(() => expect(screen.getByLabelText('Region')).toHaveValue('101'));
    await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('vi'));
    expect(screen.getByLabelText('Phone number')).toHaveValue('0123456789');
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(180);
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(75);
    expect(screen.getByLabelText('Shoe size (JP, cm)')).toHaveValue(26);
  });

  it('allows a shoe size up to the raised 500 bound (PROFILE-10)', () => {
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        languageCode="vi"
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByLabelText('Shoe size (JP, cm)')).toHaveAttribute('max', '500');
  });

  it('clamps the bio textarea at MAX_BIO_LENGTH', () => {
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ bio: '' })}
        languageCode="vi"
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    const bio = screen.getByLabelText('Bio');
    expect(bio).toHaveAttribute('maxLength', String(MAX_BIO_LENGTH));

    fireEvent.change(bio, { target: { value: 'a'.repeat(510) } });

    expect(bio).toHaveValue('a'.repeat(500));
    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('Save is disabled until a field actually changes', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        languageCode="vi"
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await testUser.clear(screen.getByLabelText('Bio'));
    await testUser.type(screen.getByLabelText('Bio'), 'New bio');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('submit calls onSave with only the changed profile fields, languageCode omitted when unchanged', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        languageCode="vi"
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    await testUser.clear(screen.getByLabelText('Bio'));
    await testUser.type(screen.getByLabelText('Bio'), 'New bio');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ profile: { bio: 'New bio' }, languageCode: undefined });
  });

  it('omits a cleared height/weight/shoe-size/date-of-birth rather than sending it as 0/empty', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ heightCm: 180 })}
        languageCode="vi"
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    await testUser.clear(screen.getByLabelText('Height (cm)'));
    await testUser.clear(screen.getByLabelText('Bio'));
    await testUser.type(screen.getByLabelText('Bio'), 'New bio');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ profile: { bio: 'New bio' }, languageCode: undefined });
  });

  it('renders the server error message when passed', () => {
    renderWithProviders(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        languageCode="vi"
        onSave={vi.fn()}
        isSaving={false}
        errorMessage="Username must be between 3 and 50 characters"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Username must be between 3 and 50 characters',
    );
  });

  describe('CLIENT-REF-3: Country / Region / Language', () => {
    it('seeds Country/Region/Language from user.countryId/regionId and the languageCode prop', async () => {
      renderWithProviders(
        <EditProfileModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={vi.fn()}
          isSaving={false}
          errorMessage={null}
        />,
      );

      await waitFor(() => expect(screen.getByLabelText('Country')).toHaveValue('1'));
      await waitFor(() => expect(screen.getByLabelText('Region')).toHaveValue('101'));
      await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('vi'));
    });

    it('shows the legacy country text read-only when countryId is null but country still holds old free text', () => {
      renderWithProviders(
        <EditProfileModal
          isOpen
          onClose={vi.fn()}
          user={user({ country: 'USA', countryId: null, regionId: null, regionName: null })}
          languageCode="vi"
          onSave={vi.fn()}
          isSaving={false}
          errorMessage={null}
        />,
      );

      expect(screen.getByText('Currently set to "USA" — pick a country below to replace it.')).toBeInTheDocument();
      // The blank option is always present regardless of load state, so this stays synchronous.
      expect(screen.getByLabelText('Country')).toHaveValue('');
    });

    it('submit sends countryId and regionId together when the country changes', async () => {
      const testUser = userEvent.setup();
      const onSave = vi.fn();
      renderWithProviders(
        <EditProfileModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={onSave}
          isSaving={false}
          errorMessage={null}
        />,
      );

      // Wait for the reference GETs to resolve (the Singapore option doesn't exist until then).
      await waitFor(() => expect(screen.getByLabelText('Country')).toHaveValue('1'));
      await testUser.selectOptions(screen.getByLabelText('Country'), '2'); // Singapore, no regions
      await waitFor(() => expect(screen.getByLabelText('Region')).toBeDisabled());
      await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

      const payload = onSave.mock.calls[0][0];
      expect(payload.profile.countryId).toBe(2);
      // Singapore has no regions — onCountryChange clears regionId, and applyGeoSelection omits a
      // null regionId from the payload (the same "absent means clear" server semantics).
      expect(payload.profile.regionId).toBeUndefined();
    });

    it('submit reports languageCode only when it actually changed', async () => {
      const testUser = userEvent.setup();
      const onSave = vi.fn();
      renderWithProviders(
        <EditProfileModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={onSave}
          isSaving={false}
          errorMessage={null}
        />,
      );

      await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('vi'));
      await testUser.selectOptions(screen.getByLabelText('Language'), 'en');
      await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(onSave).toHaveBeenCalledWith({ profile: {}, languageCode: 'en' });
    });

    it('Save is enabled by a language-only change', async () => {
      const testUser = userEvent.setup();
      renderWithProviders(
        <EditProfileModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={vi.fn()}
          isSaving={false}
          errorMessage={null}
        />,
      );

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('vi'));
      await testUser.selectOptions(screen.getByLabelText('Language'), 'en');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });
  });
});
