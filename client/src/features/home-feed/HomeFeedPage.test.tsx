import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { PageResponse, Post } from '@/features/feed/types';
import { HomeFeedPage } from './HomeFeedPage';

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

// Feed fixture facts (mirrors the old mockPosts set 1:1, real shape now —
// see e2e/mocks/handlers/feed.ts for the same set used in e2e/visual specs):
// 4 posts (2 football/Soccer sportId 5, 1 basketball sportId 6, 1 tennis
// sportId 2), Marcus Lee's post first with 14 likes.
// Matches/hashtags/broadcasts are unaffected mock data (3 matches, 4
// hashtags, 2 broadcasts, per mockData.ts).

function post(overrides: Partial<Post> & Pick<Post, 'id' | 'userFullName' | 'sportId'>): Post {
  return {
    userId: 'someone-else',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    content: `${overrides.userFullName}'s post`,
    latitude: null,
    longitude: null,
    locationName: null,
    sportName: null,
    visibility: 'public',
    media: [],
    hashtags: [],
    previewComments: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    broadcastEndTime: null,
    ...overrides,
  };
}

const feedPosts: Post[] = [
  post({ id: 1, userFullName: 'Marcus Lee', sportId: 5, likeCount: 14, hashtags: ['fridayrun'] }),
  post({ id: 2, userFullName: 'Priya Shah', sportId: 6, likeCount: 9 }),
  post({ id: 3, userFullName: 'Diego Alvarez', sportId: 2, likeCount: 21 }),
  post({ id: 4, userFullName: 'Hana Kim', sportId: 5, likeCount: 32 }),
];

// Generic despite the name (kept to minimize churn across existing call
// sites) — used for the /posts/feed Post[] shape and, since FEED-7, the
// /groups/user Group[] shape too. Both are Spring Data Page<T>-shaped.
function feedPage<T>(content: T[]): PageResponse<T> {
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

// FEED-12: HomeFeedPage now calls useParams/useNavigate (the comment
// dialog's open state lives in the URL), so it needs a real Router context
// to render at all — a bare QueryClientProvider isn't enough anymore.
// `wrapperFor` lets a test choose which path it's mounted at; `wrapper`
// (the default, `/`) covers every pre-existing test unchanged.
function wrapperFor(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={children} />
            <Route path="/posts/:postId" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}
const wrapper = wrapperFor('/');

const getMatchCtas = () => screen.getAllByRole('button', { name: /join|view details/ });
// #fridayrun exists both as a post hashtag and a trending row — scope to the rail cards
const trendingCard = () => within(screen.getByRole('region', { name: 'Trending hashtags' }));
const broadcastsCard = () => within(screen.getByRole('region', { name: 'Group broadcasts' }));

// SPORT-1: 3 real sport profiles (football/basketball/tennis, sportIds
// 5/6/2 — see sportIdMap.ts), at the 3-sport cap so the existing "Add
// sport is aria-disabled" test still holds now that sportProfiles is real.
const sportProfileFixtures = [5, 6, 2].map((sportId, index) => ({
  id: index + 1,
  userId: 'user-1',
  sportId,
  sportName: ['Soccer', 'Basketball', 'Tennis'][index],
  skillLevel: null,
  yearsOfExperience: null,
  preferredPosition: null,
  bio: null,
  attributes: null,
  isActive: true,
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
}));

/** One trending hashtag (FEED-6's real GET /hashtags/trending), matching the
 * old mock data's top row so existing `#fridayrun` assertions keep passing. */
function trendingHashtagsPage() {
  return {
    content: [{ id: 1, tag: 'fridayrun', usageCount: 128 }],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 10,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
  };
}

// FEED-7: one joined group + one active broadcast for it, matching the old
// mock data's "Riverside Ballers" row so existing broadcastsCard assertions
// keep passing. sportId 5 (football) so it's consistent with the feed
// fixtures above, though useGroupBroadcasts doesn't filter by activeSport.
const fixtureGroup = {
  id: 10,
  sportId: 5,
  groupName: 'Riverside Ballers',
  description: null,
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  memberCount: 5,
  currentUserRole: 'group_owner',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
  pinnedPosts: null,
};

function fixtureBroadcastPost(overrides: Partial<Post> = {}): Post {
  return post({
    id: 50,
    userFullName: 'Jordan Lee',
    userId: 'user-1',
    sportId: null,
    postType: 'GROUP_BROADCAST',
    groupId: fixtureGroup.id,
    content: 'Court booking confirmed for Sunday.',
    broadcastEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  });
}

/** Static (test-invariant) GET responses shared by every mock below —
 * /sports/profiles, /hashtags/trending, /posts/broadcast, /groups/user all
 * return the same fixtures regardless of which test/scenario is running.
 * Returns undefined for anything else so the caller can layer its own
 * per-test logic (e.g. a stateful /posts/feed) on top. */
function staticGetResponse(url: string): { data: unknown } | undefined {
  if (url === '/sports/profiles/user/user-1') {
    return { data: { success: true, message: '', data: sportProfileFixtures, timestamp: '' } };
  }
  if (url === '/hashtags/trending') {
    return { data: { success: true, message: '', data: trendingHashtagsPage(), timestamp: '' } };
  }
  if (url === '/posts/broadcast') {
    return { data: { success: true, message: '', data: feedPage([fixtureBroadcastPost()]), timestamp: '' } };
  }
  if (url === '/groups/user/user-1') {
    return { data: { success: true, message: '', data: feedPage([fixtureGroup]), timestamp: '' } };
  }
  return undefined;
}

/** GET mock covering the queries HomeFeedPage mounts: /posts/feed (variable
 * per test) plus every static fixture above. */
function mockFeedGet(posts: Post[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    const staticResponse = staticGetResponse(url);
    if (staticResponse) return staticResponse;
    if (url === '/posts/feed') {
      return { data: { success: true, message: '', data: feedPage(posts), timestamp: '' } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('HomeFeedPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    mockFeedGet(feedPosts);
  });

  afterEach(() => {
    // Explicit unmount before clearing the session: Vitest runs afterEach
    // hooks inside-out (this file's hook before src/test/setup.ts's global
    // `cleanup()`), so without this, HomeFeedPage briefly re-renders with
    // authStore.user === null while still mounted — and it non-null-asserts
    // user (guaranteed by ProtectedRoute in the real app), which throws.
    cleanup();
    useAuthStore.getState().clearSession();
  });

  it('renders switcher, feed, and all three rail cards from the hook', async () => {
    render(<HomeFeedPage />, { wrapper });
    expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    expect(getMatchCtas()).toHaveLength(3);
    expect(trendingCard().getByText('#fridayrun')).toBeInTheDocument();
    expect(broadcastsCard().getByText('Riverside Ballers')).toBeInTheDocument();
  });

  it('sport selection filters feed and matches together; trending/broadcasts unaffected', async () => {
    const user = userEvent.setup();
    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    await user.click(screen.getByRole('button', { name: 'Basketball' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(getMatchCtas()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sunday pickup run/ })).toBeInTheDocument();
    // Global cards unchanged (epic open question #1 resolution)
    expect(trendingCard().getByText('#fridayrun')).toBeInTheDocument();
    expect(broadcastsCard().getByText('Riverside Ballers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(getMatchCtas()).toHaveLength(3);
  });

  it('like toggle increments through the hook and reverts on second click', async () => {
    const user = userEvent.setup();
    // A static GET mock would be clobbered by the mutation's background
    // onSettled invalidate (which refetches the mounted /posts/feed query)
    // reverting the optimistic UI right back — a real backend would instead
    // confirm the new liked state, so the fixture needs to behave the same
    // way: a tiny stateful fake server, not a fixed response.
    let currentPosts = feedPosts;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(currentPosts), timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      const postId = Number(url.match(/\/posts\/(\d+)\/like/)?.[1]);
      currentPosts = currentPosts.map((p) =>
        p.id === postId ? { ...p, isLikedByCurrentUser: true, likeCount: p.likeCount + 1 } : p,
      );
      return { data: { success: true, message: '', data: null, timestamp: '' } };
    });
    vi.spyOn(apiClient, 'delete').mockImplementation(async (url: string) => {
      const postId = Number(url.match(/\/posts\/(\d+)\/like/)?.[1]);
      currentPosts = currentPosts.map((p) =>
        p.id === postId ? { ...p, isLikedByCurrentUser: false, likeCount: p.likeCount - 1 } : p,
      );
      return { data: { success: true, message: '', data: null, timestamp: '' } };
    });
    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    const likeButton = screen.getAllByRole('button', { name: 'Like' })[0];
    expect(likeButton).toHaveTextContent('14'); // Marcus Lee's post, first in feed order
    await user.click(likeButton);

    const unlikeButton = await screen.findAllByRole('button', { name: 'Unlike' });
    expect(unlikeButton[0]).toHaveTextContent('15');
    expect(unlikeButton[0]).toHaveAttribute('aria-pressed', 'true');

    await user.click(unlikeButton[0]);
    const reverted = await screen.findAllByRole('button', { name: 'Like' });
    expect(reverted[0]).toHaveTextContent('14');
  });

  it('creating a post via the composer prepends it to the feed and clears the textarea', async () => {
    const user = userEvent.setup();
    // Same reasoning as the like-toggle test above: onSettled invalidates
    // feedKeys.all in the background, which refetches the mounted feed query
    // — a static GET fixture would revert the optimistic prepend right back,
    // so this needs a tiny stateful fake server instead.
    let currentPosts = feedPosts;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(currentPosts), timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async (_url: string, body?: unknown) => {
      const { content } = body as { content: string };
      const created = post({
        id: 99,
        userFullName: 'Jordan Lee',
        userId: 'user-1',
        sportId: null,
        content,
      });
      currentPosts = [created, ...currentPosts];
      return { data: { success: true, message: '', data: created, timestamp: '' } };
    });

    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    const composer = screen.getByLabelText('Create a post');
    await user.type(composer, 'Fresh off the pitch!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('Fresh off the pitch!');
    expect(composer).toHaveValue('');
  });

  it('"Add sport" is at the 3-profile cap with real sport profiles (aria-disabled, per HF-2)', async () => {
    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    expect(screen.getByRole('button', { name: 'Add sport' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clicking a hashtag opens a modal with the real filtered results (FEED-6)', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(feedPosts), timestamp: '' } };
      }
      if (url === '/posts/hashtag/fridayrun') {
        return {
          data: {
            success: true,
            message: '',
            data: feedPage([feedPosts[0]]),
            timestamp: '',
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    await user.click(trendingCard().getByRole('button', { name: /^#fridayrun/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: '#fridayrun' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getAllByRole('article')).toHaveLength(1));
    expect(within(dialog).getByText("Marcus Lee's post")).toBeInTheDocument();
  });

  it('opening comments from inside the hashtag modal closes it and opens CommentSection instead', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(feedPosts), timestamp: '' } };
      }
      if (url === '/posts/hashtag/fridayrun') {
        return {
          data: {
            success: true,
            message: '',
            data: feedPage([feedPosts[0]]),
            timestamp: '',
          },
        };
      }
      if (url.startsWith('/posts/') && url.endsWith('/comments')) {
        return {
          data: {
            success: true,
            message: '',
            data: feedPage([]),
            timestamp: '',
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    render(<HomeFeedPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    await user.click(trendingCard().getByRole('button', { name: /^#fridayrun/ }));
    const hashtagDialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(hashtagDialog).getAllByRole('article')).toHaveLength(1));

    await user.click(within(hashtagDialog).getByRole('button', { name: /view comments/i }));

    // Same dialog role, different content — the hashtag modal closed and
    // CommentSection opened in its place (user decision, not stacked).
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '#fridayrun' })).not.toBeInTheDocument();
    });
    const commentsDialog = screen.getByRole('dialog');
    // Regression check: CommentSection's post header/content only render
    // when its `post` prop resolves to a real Post, not null — a post opened
    // from the hashtag modal isn't necessarily in the main feed's cache, so
    // this asserts usePost's own findPostInFeedCaches seed (which scans the
    // hashtag-results query too) actually found it without a real fetch
    // (previously it didn't, because activeHashtag/its query was cleared in
    // the same batched update that opened this dialog).
    expect(within(commentsDialog).getByText('Marcus Lee')).toBeInTheDocument();
    expect(within(commentsDialog).getByText("Marcus Lee's post")).toBeInTheDocument();
  });

  it('FEED-12: loading /posts/:id directly renders the correct post + comments, even for a post outside the feed', async () => {
    // The shared post (id 500) is deliberately NOT in feedPosts — proves the
    // dialog works from a cold load with no prior feed fetch at all, not
    // just for a post the feed happened to already have.
    const sharedPost = post({ id: 500, userFullName: 'Someone Else', sportId: 5, content: 'Shared post content' });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(feedPosts), timestamp: '' } };
      }
      if (url === '/posts/500') {
        return { data: { success: true, message: '', data: sharedPost, timestamp: '' } };
      }
      if (url === '/posts/500/comments') {
        return { data: { success: true, message: '', data: feedPage([]), timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    render(<HomeFeedPage />, { wrapper: wrapperFor('/posts/500') });

    // findByRole resolves as soon as the dialog *shell* exists — it renders
    // open immediately (the URL param is present from the first render),
    // while usePost's fetch is still in flight. findByText (not getByText)
    // is what actually waits for that fetch to resolve.
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Someone Else')).toBeInTheDocument();
    expect(within(dialog).getByText('Shared post content')).toBeInTheDocument();
    // The page underneath is still the normal Home Feed (Option A) — its
    // markup exists (not a lighter dedicated shell), just correctly hidden
    // from the accessibility tree while the modal has focus (Radix sets
    // aria-hidden on the rest of the page), so this checks raw text content
    // rather than getByRole('article'), which aria-hidden intentionally
    // excludes at this point — the next test covers the post-close state
    // where the feed is genuinely focusable/queryable again.
    expect(document.body.textContent).toContain("Marcus Lee's post");
  });

  it('FEED-12: closing a dialog opened via direct URL returns to a sane page state, not a bare backdrop', async () => {
    const sharedPost = post({ id: 500, userFullName: 'Someone Else', sportId: 5, content: 'Shared post content' });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/posts/feed') {
        return { data: { success: true, message: '', data: feedPage(feedPosts), timestamp: '' } };
      }
      if (url === '/posts/500') {
        return { data: { success: true, message: '', data: sharedPost, timestamp: '' } };
      }
      if (url === '/posts/500/comments') {
        return { data: { success: true, message: '', data: feedPage([]), timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    const user = userEvent.setup();

    render(<HomeFeedPage />, { wrapper: wrapperFor('/posts/500') });
    const dialog = await screen.findByRole('dialog');
    // Let the post actually resolve before interacting — closing mid-fetch
    // isn't this test's concern, and doing so kept the dialog's loading-state
    // Close button mounted through the async gap in a way that made the
    // subsequent click unreliable.
    await within(dialog).findByText('Someone Else');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Not a bare backdrop — the normal Home Feed content is there.
    expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument();
  });
});
