import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useSessionCommentsData } from './useSessionCommentsData';

// CLIENT-GL-50: the people the `@` of a session comment offers. A record command has its own list; a normal comment never
// offers the caller themselves.

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const envelope = <T,>(data: T) => ({ data: { success: true, message: '', timestamp: '', data } });
const emptyPage = {
  content: [],
  totalPages: 1,
  totalElements: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
  numberOfElements: 0,
  empty: true,
};

describe('useSessionCommentsData mention source', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: {
        id: 'me',
        email: 'me@example.com',
        firstName: 'Jordan',
        lastName: 'Lee',
        username: 'jordan',
        phoneNumber: null,
        avatarUrl: null,
        roles: ['ROLE_USER'],
      },
      accessToken: 'token',
      isBootstrapping: false,
    });
  });

  it('offers the thread people but never the caller, and asks for one more so the list still fills', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/sessions/9/comments') return envelope(emptyPage);
      if (url === '/sessions/9/thread-people') {
        return envelope([
          { userId: 'me', fullName: 'Jordan Lee', avatarUrl: null },
          { userId: 'p', fullName: 'Priya Shah', avatarUrl: null },
        ]);
      }
      throw new Error(`unexpected GET ${url}`);
    });
    const { result } = renderHook(() => useSessionCommentsData(9, true), { wrapper });

    act(() => result.current.mentionSource.onQueryChange('j'));
    await waitFor(() => expect(result.current.mentionSource.options).toHaveLength(1));
    expect(result.current.mentionSource.options[0]).toMatchObject({ id: 'p', name: 'Priya Shah' });
    expect(get).toHaveBeenCalledWith('/sessions/9/thread-people', { params: { q: 'j', size: 6 } });
  });
});
