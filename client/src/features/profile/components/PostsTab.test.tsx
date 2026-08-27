import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import type { PageResponse, Post } from '@/features/feed/types';
import { PostsTab } from './PostsTab';

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

function post(overrides: Partial<Post> & Pick<Post, 'id' | 'sportId'>): Post {
  return {
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    content: 'my own post',
    latitude: null,
    longitude: null,
    locationName: null,
    visibility: 'public',
    media: [],
    hashtags: [],
    previewComments: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-08-26T09:00:00',
    updatedAt: '2026-08-26T09:00:00',
    broadcastEndTime: null,
    ...overrides,
  };
}

function page<T>(content: T[]): PageResponse<T> {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

const sportProfileFixtures = [
  {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Soccer',
    skillLevel: null,
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
  {
    id: 2,
    userId: 'user-1',
    sportId: 6,
    sportName: 'Basketball',
    skillLevel: null,
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
];

function myPosts(): Post[] {
  return [
    post({ id: 1, sportId: 5, content: 'Football post #fridayrun', hashtags: ['fridayrun'] }),
    post({ id: 2, sportId: 6, content: 'Basketball post' }),
  ];
}

function mockGet(posts: Post[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/posts/mine') {
      return { data: { success: true, message: '', data: page(posts), timestamp: '' } };
    }
    if (url === '/sports/profiles/user/user-1') {
      return { data: { success: true, message: '', data: sportProfileFixtures, timestamp: '' } };
    }
    if (url.startsWith('/posts/') && url.endsWith('/comments')) {
      return { data: { success: true, message: '', data: page([]), timestamp: '' } };
    }
    if (/^\/posts\/\d+$/.test(url)) {
      const postId = Number(url.split('/')[2]);
      const found = posts.find((p) => p.id === postId);
      return { data: { success: true, message: '', data: found, timestamp: '' } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('PostsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useProfilePageStore.setState({ activeSport: null });
    mockGet(myPosts());
  });

  afterEach(() => {
    // Explicit unmount before clearing the session: Vitest runs afterEach
    // hooks inside-out (this file's hook before src/test/setup.ts's global
    // cleanup()), so without this, PostsTab briefly re-renders with
    // authStore.user === null while still mounted — and it non-null-asserts
    // user (guaranteed by ProtectedRoute in the real app), which throws.
    cleanup();
    useAuthStore.getState().clearSession();
    useProfilePageStore.setState({ activeSport: null });
  });

  it('renders the composer and defaults to the first sport profile\'s posts (no "all" pill on this page)', async () => {
    render(<PostsTab />, { wrapper });
    expect(screen.getByPlaceholderText(/what's on your mind/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByText('Football post')).toBeInTheDocument();
    expect(screen.queryByText('Basketball post')).not.toBeInTheDocument();
  });

  it('filters the list by the active sport pill', async () => {
    useProfilePageStore.setState({ activeSport: 'basketball' });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByText('Basketball post')).toBeInTheDocument();
  });

  it('composer tags the new post with the active sport pill', async () => {
    useProfilePageStore.setState({ activeSport: 'basketball' });
    const user = userEvent.setup();
    mockGet(myPosts());
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/posts') {
        return {
          data: { success: true, message: '', data: post({ id: 99, sportId: 6, ...(body as object) }), timestamp: '' },
        };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.type(screen.getByPlaceholderText(/what's on your mind/i), 'New post');
    await user.click(screen.getByRole('button', { name: /^post$/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/posts', { content: 'New post', sportId: 6 }),
    );
  });

  it('composer omits sportId for a caller with zero sport profiles (no "all" pill to fall back to)', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/mine') {
        return { data: { success: true, message: '', data: page([]), timestamp: '' } };
      }
      if (url === '/sports/profiles/user/user-1') {
        return { data: { success: true, message: '', data: [], timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/posts') {
        return { data: { success: true, message: '', data: post({ id: 99, sportId: 5, ...(body as object) }), timestamp: '' } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.queryAllByRole('article')).toHaveLength(0));

    await user.type(screen.getByPlaceholderText(/what's on your mind/i), 'New post');
    await user.click(screen.getByRole('button', { name: /^post$/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/posts', { content: 'New post', sportId: undefined }),
    );
  });

  it('like wiring calls the like endpoint for the clicked post', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, message: '', data: null, timestamp: '' } });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /like/i })[0]);

    expect(apiClient.post).toHaveBeenCalledWith('/posts/1/like');
  });

  it('delete wiring calls the delete endpoint for the clicked post', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true, message: '', data: null, timestamp: '' } });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /options/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(apiClient.delete).toHaveBeenCalledWith('/posts/1');
  });

  it('opens the comment dialog for the clicked post and fetches its comments', async () => {
    const user = userEvent.setup();
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /comment/i })[0]);

    // usePost's own initialData seeds from the mounted /posts/mine cache
    // (now a "post feed" family member per the cache-key fix above), so no
    // separate GET /posts/1 fires — the dialog opens instantly from cache.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveTextContent('Football post');
    expect(apiClient.get).toHaveBeenCalledWith('/posts/1/comments', expect.anything());
  });

  it('opens the hashtag modal when a hashtag is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/mine') {
        return { data: { success: true, message: '', data: page(myPosts()), timestamp: '' } };
      }
      if (url === '/sports/profiles/user/user-1') {
        return { data: { success: true, message: '', data: sportProfileFixtures, timestamp: '' } };
      }
      if (url === '/posts/hashtag/fridayrun') {
        return { data: { success: true, message: '', data: page([]), timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    render(<PostsTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: '#fridayrun' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith(
      '/posts/hashtag/fridayrun',
      expect.anything(),
    );
  });
});
