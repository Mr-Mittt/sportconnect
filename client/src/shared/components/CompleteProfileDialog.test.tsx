import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/app/i18n';
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

beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const path = url as string;
    if (path === '/reference/languages') return apiResponse(languages);
    if (path === '/reference/countries') return apiResponse([vietnam]);
    if (/\/reference\/countries\/1\/regions/.test(path)) return apiResponse([hanoi]);
    throw new Error(`unexpected GET ${path}`);
  });
  // Silent detection finds nothing, so the fields start empty.
  vi.spyOn(apiClient, 'post').mockResolvedValue(
    apiResponse({ language: null, country: null, region: null, source: null }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function profile(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
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
    ...overrides,
  } as UserResponse;
}

function dialog(props: Partial<React.ComponentProps<typeof CompleteProfileDialog>> = {}) {
  return (
    <CompleteProfileDialog
      isOpen
      user={profile()}
      languageCode={null}
      onSave={vi.fn()}
      onSkip={vi.fn()}
      isSaving={false}
      errorMessage={null}
      {...props}
    />
  );
}

describe('CompleteProfileDialog', () => {
  it('explains why the zone matters and where to change it later', async () => {
    renderDialog(dialog());

    expect(await screen.findByRole('dialog', { name: 'Complete your profile' })).toBeInTheDocument();
    expect(screen.getByText(/discover the sport community in your area/i)).toBeInTheDocument();
    expect(screen.getByText(/change it any time in Account Settings/i)).toBeInTheDocument();
  });

  it('keeps Save disabled until a country is chosen, then sends the country and region', async () => {
    const onSave = vi.fn();
    renderDialog(dialog({ onSave }));
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await userEvent.selectOptions(await screen.findByLabelText('Country'), 'Vietnam');
    await userEvent.selectOptions(await screen.findByLabelText('Region'), 'Hanoi');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].profile).toEqual({ countryId: 1, regionId: 101 });
  });

  it('Skip for now calls onSkip and saves nothing', async () => {
    const onSave = vi.fn();
    const onSkip = vi.fn();
    renderDialog(dialog({ onSave, onSkip }));

    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('while saving, both buttons are disabled and Esc does not skip', async () => {
    const onSkip = vi.fn();
    renderDialog(dialog({ isSaving: true, onSkip }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('shows the save error in an alert', async () => {
    renderDialog(dialog({ errorMessage: 'Could not save your profile.' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your profile.');
  });

  it('is pre-filled when the profile already has a country but no region', async () => {
    renderDialog(dialog({ user: profile({ countryId: 1 }) }));

    await waitFor(() => expect(screen.getByLabelText('Country')).toHaveValue('1'));
    expect(await screen.findByLabelText('Region')).toHaveValue('');
  });
});
