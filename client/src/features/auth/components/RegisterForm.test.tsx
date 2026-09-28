import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useLocaleStore } from '@/app/localeStore';
import type { CountryResponse, LanguageResponse, RegionResponse, ResolvedGeoResponse } from '@/shared/types/reference';
import { RegisterForm } from './RegisterForm';

// Same module-mock shape as useGeoLocaleFieldsData.test.tsx — RegisterForm now wires that hook
// directly, so its browser-detection dependencies need the same deterministic stand-ins.
vi.mock('@/shared/lib/detectEnvironment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/detectEnvironment')>();
  return {
    ...actual,
    getBrowserLocales: () => ['en-US'],
    requestBrowserPosition: vi.fn(),
  };
});
vi.mock('@/shared/lib/viewerZone', () => ({ getViewerZoneId: () => 'UTC' }));

// Imported after the mocks above so the component under test picks them up.
import { requestBrowserPosition } from '@/shared/lib/detectEnvironment';

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const countries: CountryResponse[] = [vietnam];
const hcmc: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };
const allNull: ResolvedGeoResponse = { language: null, country: null, region: null, source: null };

function mockReferenceGets() {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const path = url as string;
    if (path === '/reference/languages') return apiResponse(languages);
    if (path === '/reference/countries') return apiResponse(countries);
    if (path.startsWith('/reference/countries/')) return apiResponse([hcmc]);
    throw new Error(`unexpected GET ${path}`);
  });
}

/** No `navigator.geolocation` by default in this jsdom environment (confirmed against
 * detectEnvironment.test.ts) — set it explicitly for the one test that needs the "Use my
 * current location" button to actually render. */
function setGeolocationSupported(supported: boolean): void {
  if (!supported) {
    delete (navigator as { geolocation?: Geolocation }).geolocation;
    return;
  }
  Object.defineProperty(navigator, 'geolocation', { value: {}, configurable: true });
}

function renderForm(props: Partial<React.ComponentProps<typeof RegisterForm>> = {}) {
  const onSubmit = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegisterForm onSubmit={onSubmit} isPending={false} errorMessage={null} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSubmit };
}

// Regex, not exact strings — Email/Password/Full name now carry a visual `RequiredMark` ("Email
// *"), whose text is part of the label's textContent even though `aria-hidden` hides it from
// screen readers; RTL's `getByLabelText` doesn't respect `aria-hidden` when reading label text.
// Same pattern `CreateSessionModal.test.tsx` already uses for its own `RequiredMark`-decorated
// fields (`/^Sport/`, etc.).
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Email/), 'jordan@example.com');
  await user.type(screen.getByLabelText(/^Password/), 'password123');
  await user.type(screen.getByLabelText(/^Full name/), 'Jordan Lee');
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockReferenceGets();
    // The silent mount resolve (locales + timezone, no coordinates) — all-null so it never
    // interferes with a test's own field assertions unless that test overrides it.
    vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(allNull));
    setGeolocationSupported(false);
  });

  afterEach(() => {
    setGeolocationSupported(false);
    if (useLocaleStore.getState().locale !== 'en') {
      useLocaleStore.getState().setLocale('en');
    }
  });

  it('submits email, password, full name, and the seeded languageCode, without a phone number or the rest of geo', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // languageCode is always present, even untouched — it's seeded from the active UI locale
    // (2026-09-28 fix; test setup pins that to 'en'), on the reasoning that whatever language the
    // user experienced the whole sign-up flow in is a sensible default registration preference,
    // not an arbitrary value. countryId/regionId/latitude/longitude stay omitted since nothing
    // seeds those the same way.
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'jordan@example.com',
      password: 'password123',
      fullName: 'Jordan Lee',
      languageCode: 'en',
    });
  });

  it('includes phoneNumber when provided', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText('Phone number'), '555-0100');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jordan@example.com',
        password: 'password123',
        fullName: 'Jordan Lee',
        phoneNumber: '555-0100',
      }),
    );
  });

  it('rejects letters typed into the phone number field, keeping digits/+/-/()/space', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Phone number'), 'a+1 (555) 555b-0100c');

    expect(screen.getByLabelText('Phone number')).toHaveValue('+1 (555) 555-0100');
  });

  it('rejects a pasted string containing anything but digits/+/-/()/space in the phone number field', async () => {
    const user = userEvent.setup();
    renderForm();

    const phoneInput = screen.getByLabelText('Phone number');
    await user.click(phoneInput);
    await user.paste('call me: 555-0100');
    expect(phoneInput).toHaveValue('');

    await user.paste('+1 (555) 555-0100');
    expect(phoneInput).toHaveValue('+1 (555) 555-0100');
  });

  describe('custom validation (noValidate — no native browser popups, see AUTH-2/CLIENT-REF-2 doc comment)', () => {
    it('does not submit and shows no messages before any submit attempt', () => {
      renderForm();
      expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
      expect(screen.queryByText('Password must be at least 8 characters.')).not.toBeInTheDocument();
      expect(screen.queryByText('Full name is required.')).not.toBeInTheDocument();
    });

    it('shows required/format messages beside each label on an invalid submit attempt, and never calls onSubmit', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
      await user.type(screen.getByLabelText(/^Password/), 'short');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
      expect(screen.getByText('Full name is required.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows "Email is required." (not the format message) when Email is left blank', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(screen.getByText('Email is required.')).toBeInTheDocument();
      expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument();
    });

    it('clears a field message the moment that field becomes valid, without re-submitting', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(screen.getByText('Full name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Full name/), 'Jordan Lee');
      expect(screen.queryByText('Full name is required.')).not.toBeInTheDocument();
    });

    it('submits once every field is valid', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      // languageCode: 'en' — the localeStore seed, not an explicit pick; see the dedicated test above.
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'jordan@example.com',
        password: 'password123',
        fullName: 'Jordan Lee',
        languageCode: 'en',
      });
    });
  });

  it('renders the server error message inline', () => {
    renderForm({ errorMessage: 'Email already registered' });
    expect(screen.getByRole('alert')).toHaveTextContent('Email already registered');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderForm();

    const passwordInput = screen.getByLabelText(/^Password/);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('disables the submit button while pending', () => {
    renderForm({ isPending: true });
    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
  });

  it('renders OAuth buttons as disabled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  });

  it('links to /login', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  describe('CLIENT-REF-2: Language / Country / Region', () => {
    it('renders the GeoLocaleFields selects, disabled until the reference lists load', async () => {
      renderForm();
      await waitFor(() => expect(screen.getByLabelText('Language')).not.toBeDisabled());
      expect(screen.getByLabelText('Country')).not.toBeDisabled();
    });

    it('includes languageCode in the payload once a language is chosen', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByLabelText('Language')).not.toBeDisabled());

      await user.selectOptions(screen.getByLabelText('Language'), 'vi');
      // Choosing 'vi' also flips the whole form's visible copy (see the next test) — the submit
      // button is now its Vietnamese translation, not "Create account".
      await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ languageCode: 'vi' }));
    });

    it('switches the UI language immediately when a supported language is chosen', async () => {
      const user = userEvent.setup();
      renderForm();
      await waitFor(() => expect(screen.getByLabelText('Language')).not.toBeDisabled());

      await user.selectOptions(screen.getByLabelText('Language'), 'vi');

      expect(useLocaleStore.getState().locale).toBe('vi');
    });

    it('includes countryId and regionId once picked, clearing region on country change', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByLabelText('Country')).not.toBeDisabled());

      await user.selectOptions(screen.getByLabelText('Country'), '1');
      await waitFor(() => expect(screen.getByLabelText('Region')).not.toBeDisabled());
      await user.selectOptions(screen.getByLabelText('Region'), '101');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ countryId: 1, regionId: 101 }));
    });

    it('omits coordinates when "Use my current location" was never used, even with a country chosen', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByLabelText('Country')).not.toBeDisabled());
      await user.selectOptions(screen.getByLabelText('Country'), '1');

      await user.click(screen.getByRole('button', { name: 'Create account' }));

      const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('latitude');
      expect(payload).not.toHaveProperty('longitude');
    });

    it('includes coordinates only after "Use my current location" succeeds', async () => {
      setGeolocationSupported(true);
      vi.mocked(requestBrowserPosition).mockResolvedValueOnce({
        status: 'granted',
        latitude: 10.7769,
        longitude: 106.7009,
      });
      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await fillRequiredFields(user);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));
      await waitFor(() =>
        expect(apiClient.post).toHaveBeenLastCalledWith(
          '/reference/resolve',
          expect.objectContaining({ latitude: 10.7769, longitude: 106.7009 }),
        ),
      );

      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 10.7769, longitude: 106.7009 }),
      );
    });

    it('does not switch the UI language for an unsupported language code (mapToSupportedLocale returns null)', async () => {
      // A third active language outside SUPPORTED_LOCALES ('en'/'vi' only, REF-4 hasn't shipped
      // more yet) — picking it must still set the field's own languageCode (for submission) but
      // must never touch localeStore, which only understands the UI's own two bundles.
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
        const path = url as string;
        if (path === '/reference/languages') {
          return apiResponse([...languages, { code: 'fr', name: 'French', nativeName: 'Français' }]);
        }
        if (path === '/reference/countries') return apiResponse(countries);
        if (path.startsWith('/reference/countries/')) return apiResponse([hcmc]);
        throw new Error(`unexpected GET ${path}`);
      });

      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByLabelText('Language')).not.toBeDisabled());

      await user.selectOptions(screen.getByLabelText('Language'), 'fr');
      expect(useLocaleStore.getState().locale).toBe('en');

      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ languageCode: 'fr' }));
    });
  });
});
