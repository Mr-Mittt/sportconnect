import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { apiClient } from '@/app/apiClient';
import { MAX_BIO_LENGTH } from '@/features/profile/types';
import type { UserResponse } from '@/features/profile/types';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { AccountSettingsModal } from './AccountSettingsModal';

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
 * CLIENT-REF-3: `AccountSettingsModal` now wires `useGeoLocaleFieldsData()` itself (real TanStack
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

describe('AccountSettingsModal', () => {
  it('renders seeded from the user prop, including the physical-stats fields', async () => {
    renderWithProviders(
      <AccountSettingsModal
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
      <AccountSettingsModal
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
      <AccountSettingsModal
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
      <AccountSettingsModal
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
      <AccountSettingsModal
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
      <AccountSettingsModal
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
      <AccountSettingsModal
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
        <AccountSettingsModal
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
        <AccountSettingsModal
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
        <AccountSettingsModal
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
        <AccountSettingsModal
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
        <AccountSettingsModal
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

  it('gender is a Male/Female dropdown that sends the enum value (ACCOUNT-1)', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <AccountSettingsModal isOpen onClose={vi.fn()} user={user()} languageCode="vi" onSave={onSave} isSaving={false} errorMessage={null} />,
    );

    const gender = screen.getByLabelText('Gender');
    expect(gender.tagName).toBe('SELECT');
    expect(within(gender).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not specified', 'Male', 'Female']);

    await testUser.selectOptions(gender, 'FEMALE');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ profile: { gender: 'FEMALE' }, languageCode: undefined });
  });

  it('maps a legacy free-text gender ("female") onto its enum value without marking the form dirty', () => {
    renderWithProviders(
      <AccountSettingsModal isOpen onClose={vi.fn()} user={user({ gender: 'female' })} languageCode="vi" onSave={vi.fn()} isSaving={false} errorMessage={null} />,
    );

    expect(screen.getByLabelText('Gender')).toHaveValue('FEMALE');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('keeps an unrecognised legacy gender selectable instead of blanking it', () => {
    renderWithProviders(
      <AccountSettingsModal isOpen onClose={vi.fn()} user={user({ gender: 'asdf' })} languageCode="vi" onSave={vi.fn()} isSaving={false} errorMessage={null} />,
    );

    expect(screen.getByLabelText('Gender')).toHaveValue('asdf');
    expect(screen.getByRole('option', { name: 'asdf' })).toBeInTheDocument();
  });

  it('height/weight/shoe size reject e, +, -, . keystrokes and non-digit pastes; the phone field rejects letters', () => {
    renderWithProviders(
      <AccountSettingsModal isOpen onClose={vi.fn()} user={user()} languageCode="vi" onSave={vi.fn()} isSaving={false} errorMessage={null} />,
    );

    for (const label of ['Height (cm)', 'Weight (kg)', 'Shoe size (JP, cm)']) {
      for (const key of ['e', '-', '+', '.']) {
        // fireEvent returns false when the event's default was prevented.
        expect(fireEvent.keyDown(screen.getByLabelText(label), { key })).toBe(false);
      }
      expect(fireEvent.keyDown(screen.getByLabelText(label), { key: '7' })).toBe(true);
      expect(fireEvent.paste(screen.getByLabelText(label), { clipboardData: { getData: () => '-5' } })).toBe(false);
    }

    const phone = screen.getByLabelText('Phone number');
    expect(fireEvent.keyDown(phone, { key: 'a' })).toBe(false);
    expect(fireEvent.keyDown(phone, { key: '+' })).toBe(true);
    expect(fireEvent.paste(phone, { clipboardData: { getData: () => 'call me!' } })).toBe(false);
  });

  it('does not offer avatar or cover fields (they stay in EditProfileModal)', () => {
    renderWithProviders(
      <AccountSettingsModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        languageCode="vi"
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.queryByLabelText('Avatar URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cover URL')).not.toBeInTheDocument();
  });

  describe('i18n', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    it('renders Vietnamese copy', async () => {
      await i18n.changeLanguage('vi');
      renderWithProviders(
        <AccountSettingsModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={vi.fn()}
          isSaving={false}
          errorMessage={null}
        />,
      );

      expect(screen.getByRole('dialog', { name: 'Cài đặt tài khoản' })).toBeInTheDocument();
      expect(screen.getByLabelText('Tên')).toHaveValue('Jordan');
      expect(screen.getByLabelText('Tiểu sử')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
    });

    it('prefers an override-prefix key over the default copy', () => {
      i18n.addResourceBundle(
        'en',
        'accountSettingsOverrideTest',
        { custom: { title: 'My details' } },
        true,
        true,
      );
      renderWithProviders(
        <AccountSettingsModal
          isOpen
          onClose={vi.fn()}
          user={user()}
          languageCode="vi"
          onSave={vi.fn()}
          isSaving={false}
          errorMessage={null}
          i18nOverridePrefix="accountSettingsOverrideTest:custom"
        />,
      );

      expect(screen.getByRole('dialog', { name: 'My details' })).toBeInTheDocument();
      // Untouched keys fall back to the default namespace.
      expect(screen.getByLabelText('First name')).toBeInTheDocument();
    });
  });
});
