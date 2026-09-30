import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useGroupsPageStore } from '@/app/groupsPageStore';
import type { Group } from '@/features/feed/types';
import { GroupsPage } from './GroupsPage';

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

const DISCOVERY_SEARCH_LABEL = 'Group name or invite code';

const group: Group = {
  id: 42,
  sportId: 5,
  groupName: 'Riverside Ballers',
  description: null,
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  memberCount: 12,
  currentUserRole: 'group_member',
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
  pinnedPosts: null,
};

const footballProfile = {
  id: 101,
  userId: 'user-1',
  sportId: 5,
  sportName: 'Football',
  skillLevel: 'beginner',
  yearsOfExperience: 2,
  bio: null,
  attributes: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00',
  updatedAt: '2026-01-01T00:00:00',
};

/** Data router — `GroupsPage`'s unsaved-changes guard uses `useBlocker`. */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <>{children}</> }], {
    initialEntries: ['/'],
  });
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function page<T>(content: T[]) {
  return apiResponse({
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  });
}

/** Everything but `/groups/user/*` answers with an empty page (or the sport fixtures); the
 * groups request is the one each test controls. */
function mockGet(groupsResponse: () => Promise<unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/groups/user/user-1') return groupsResponse() as never;
    if (url === '/sports/profiles') return apiResponse([footballProfile]) as never;
    if (url === '/sports') {
      return apiResponse([{ id: 5, name: 'Football', iconUrl: null }]) as never;
    }
    if (url.endsWith('/attribute-schema')) return apiResponse(null) as never;
    if (url === '/reference/languages' || url === '/reference/countries') {
      return apiResponse([]) as never;
    }
    return page([]) as never;
  });
}

describe('GroupsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useGroupsPageStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
    useGroupsPageStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });
  });

  describe('GRP-11: pending group selection', () => {
    it('shows the cover placeholder, not the discovery panel, while the groups query is loading', async () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      mockGet(() => new Promise(() => {}));
      render(<GroupsPage />, { wrapper });

      expect(await screen.findByTestId('group-cover-banner-placeholder')).toBeInTheDocument();
      expect(screen.getByText('Loading group…')).toBeInTheDocument();
      expect(screen.queryByLabelText(DISCOVERY_SEARCH_LABEL)).not.toBeInTheDocument();
    });

    it('keeps the same placeholder when the groups query errors', async () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      mockGet(() => Promise.reject(new Error('boom')));
      render(<GroupsPage />, { wrapper });

      await waitFor(() =>
        expect(screen.getByTestId('group-cover-banner-placeholder')).toBeInTheDocument(),
      );
      expect(screen.queryByLabelText(DISCOVERY_SEARCH_LABEL)).not.toBeInTheDocument();
    });

    it('swaps to the real banner once the groups query resolves with the selected group', async () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      mockGet(async () => page([group]));
      render(<GroupsPage />, { wrapper });

      expect(await screen.findByText('12 members')).toBeInTheDocument();
      expect(screen.queryByTestId('group-cover-banner-placeholder')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(DISCOVERY_SEARCH_LABEL)).not.toBeInTheDocument();
    });

    it('lets the user leave the pending selection via "All groups"', async () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      mockGet(() => new Promise(() => {}));
      render(<GroupsPage />, { wrapper });

      (await screen.findByRole('button', { name: 'All groups' })).click();

      expect(await screen.findByLabelText(DISCOVERY_SEARCH_LABEL)).toBeInTheDocument();
      expect(screen.queryByTestId('group-cover-banner-placeholder')).not.toBeInTheDocument();
    });

    it('shows the discovery panel and no placeholder when nothing is selected, even while loading', async () => {
      mockGet(() => new Promise(() => {}));
      render(<GroupsPage />, { wrapper });

      expect(await screen.findByLabelText(DISCOVERY_SEARCH_LABEL)).toBeInTheDocument();
      expect(screen.queryByTestId('group-cover-banner-placeholder')).not.toBeInTheDocument();
    });

    it('falls back to the discovery panel for a stale id once the query has resolved without it', async () => {
      useGroupsPageStore.getState().selectGroup(999, 5);
      mockGet(async () => page([group]));
      render(<GroupsPage />, { wrapper });

      expect(await screen.findByLabelText(DISCOVERY_SEARCH_LABEL)).toBeInTheDocument();
      expect(screen.queryByTestId('group-cover-banner-placeholder')).not.toBeInTheDocument();
    });
  });
});
