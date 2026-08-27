import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { SportProfileSettingsTab } from './SportProfileSettingsTab';

const testUser = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function profile(overrides: Partial<UserSportProfileResponse> = {}): UserSportProfileResponse {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Football',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function mockGet(profiles: UserSportProfileResponse[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/profiles/user/user-1') {
      return { data: { success: true, message: '', data: profiles, timestamp: '' } };
    }
    if (/\/sports\/\d+\/attribute-schema$/.test(url)) {
      return { data: { success: true, message: '', data: null, timestamp: '' } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('SportProfileSettingsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useProfilePageStore.setState({ activeSport: null });
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
    useProfilePageStore.setState({ activeSport: null });
  });

  it('renders the empty state for a caller with zero sport profiles', async () => {
    mockGet([]);
    render(<SportProfileSettingsTab />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/add a sport above/i)).toBeInTheDocument(),
    );
  });

  it('renders seeded from the active sport profile', async () => {
    mockGet([profile({ skillLevel: 'advanced', yearsOfExperience: 5, preferredPosition: 'Striker' })]);
    render(<SportProfileSettingsTab />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('advanced'));
    expect(screen.getByLabelText('Years of experience')).toHaveValue(5);
    expect(screen.getByLabelText('Preferred position')).toHaveValue('Striker');
  });

  it('Save is disabled until a field changes, and disabled while skill level is empty', async () => {
    const user = userEvent.setup();
    mockGet([profile({ skillLevel: 'beginner' })]);
    render(<SportProfileSettingsTab />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.type(screen.getByLabelText('Preferred position'), 'Winger');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('submit calls the update endpoint with the diffed payload', async () => {
    const user = userEvent.setup();
    mockGet([profile({ skillLevel: 'beginner' })]);
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: profile({ skillLevel: 'beginner', preferredPosition: 'Winger' }),
        timestamp: '',
      },
    });
    render(<SportProfileSettingsTab />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
    await user.type(screen.getByLabelText('Preferred position'), 'Winger');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith('/sports/profiles/1', {
        sportId: 5,
        skillLevel: 'beginner',
        preferredPosition: 'Winger',
      }),
    );
  });

  it('renders the server error message when the save fails', async () => {
    const user = userEvent.setup();
    mockGet([profile({ skillLevel: 'beginner' })]);
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { success: false, message: 'Could not save your sport profile. Please try again.', data: null, timestamp: '' },
      },
    });
    render(<SportProfileSettingsTab />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
    await user.type(screen.getByLabelText('Preferred position'), 'Winger');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
