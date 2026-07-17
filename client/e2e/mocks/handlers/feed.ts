import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  Comment,
  CreateCommentPayload,
  CreatePostPayload,
  Post,
} from '../../../src/features/feed/types.ts';
import {
  mockBasketballPost,
  mockBroadcastPost,
  mockComment,
  mockExpiredBroadcastPost,
  mockGroupPost,
  mockHashtag,
  mockPageResponse,
  mockPost,
  mockUser,
} from '../fixtures.ts';
import { hoursFromNow } from '../../../src/shared/lib/mockClock.ts';
import { consumeCreatePostFailOnce, getOverrides } from '../overrides.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

interface FeedSession {
  // A small in-memory fake backend, not a fixed responder — FEED-1's
  // optimistic like/unlike/delete mutations always reconcile via a
  // background invalidate+refetch of GET /posts/feed (onSettled). A
  // stateless GET handler would clobber the optimistic UI state the instant
  // that refetch lands (confirmed: this exact bug was caught in
  // useHomeFeedData's own Vitest suite before this handler was made
  // stateful). A real backend would show the like as persisted on refetch,
  // so this fixture needs to too.
  postsState: Post[];
  // FEED-10: kept separate from postsState — the real personal feed never
  // blends in GROUP_BROADCAST posts (see usePersonalFeed's own doc comment),
  // so mixing these into postsState would inflate every existing spec's
  // article-count assertions. `mockExpiredBroadcastPost` exists here so the
  // /posts/broadcast handler below has a genuine second candidate to exclude
  // by expiry, not just a hardcoded single-item response.
  broadcastsState: Post[];
  // FEED-2's comment threads, keyed by postId — same "small stateful fake
  // backend, not a fixed responder" reasoning as postsState above (comment
  // mutations reconcile via invalidate+refetch too).
  commentsState: Record<number, Comment[]>;
}

function defaultFeedSession(): FeedSession {
  return {
    postsState: [mockPost, mockGroupPost, mockBasketballPost],
    broadcastsState: [mockBroadcastPost, mockExpiredBroadcastPost],
    commentsState: { [mockPost.id]: [mockComment] },
  };
}

// MSW-1: one Node process serves every Playwright test concurrently, so this
// state is keyed per-session (see sessionStore.ts) instead of the plain
// module-level `let` it used to be — otherwise two tests running at the same
// time would corrupt each other's posts/comments.
const feedSessions = createSessionStore(defaultFeedSession);

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

function bumpPostCommentCount(session: FeedSession, postId: number, delta: number): void {
  session.postsState = session.postsState.map((post) =>
    post.id === postId ? { ...post, commentCount: Math.max(0, post.commentCount + delta) } : post,
  );
}

/** Locates a comment (root or one-level reply) across every post's thread. */
function locateComment(
  session: FeedSession,
  commentId: number,
): { postId: number; parentCommentId: number | null } | null {
  for (const [postIdKey, comments] of Object.entries(session.commentsState)) {
    for (const comment of comments) {
      if (comment.id === commentId) return { postId: Number(postIdKey), parentCommentId: null };
      if (comment.replies.some((reply) => reply.id === commentId)) {
        return { postId: Number(postIdKey), parentCommentId: comment.id };
      }
    }
  }
  return null;
}

function transformComment(
  session: FeedSession,
  postId: number,
  commentId: number,
  transform: (comment: Comment) => Comment,
): void {
  session.commentsState = {
    ...session.commentsState,
    [postId]: (session.commentsState[postId] ?? []).map((comment) => {
      if (comment.id === commentId) return transform(comment);
      if (comment.replies.some((reply) => reply.id === commentId)) {
        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === commentId ? transform(reply) : reply,
          ),
        };
      }
      return comment;
    }),
  };
}

// FEED-10: genuinely pages over postsState (real page/size from the
// request), rather than mockPageResponse's "always one page" shortcut —
// needed so a large seeded feed (seedPostsState below) can exercise a real
// second page. Harmless for every existing spec's small (<20-post) fixture:
// fewer posts than PAGE_SIZE always still fits entirely on page 0 with
// last:true, identical to mockPageResponse's previous behavior.
const FEED_PAGE_SIZE = 20;
function pagedFeedResponse(all: Post[], page: number) {
  const start = page * FEED_PAGE_SIZE;
  const content = all.slice(start, start + FEED_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(all.length / FEED_PAGE_SIZE));
  return {
    content,
    totalPages,
    totalElements: all.length,
    number: page,
    size: FEED_PAGE_SIZE,
    first: page === 0,
    last: page >= totalPages - 1,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

export const feedHandlers: HttpHandler[] = [
  http.get('/api/posts/feed', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    // MSW-1: replaces apiErrors.ts's overrideFeedToError / emptyFeed.ts's
    // overrideFeedToEmpty — checked first, same precedence a worker.use()
    // override used to have over the base handler.
    if (getOverrides(sessionId).feedError) {
      return HttpResponse.json(apiError('Simulated feed failure'), { status: 500 });
    }
    const page = Number(new URL(request.url).searchParams.get('page') ?? 0);
    const posts = getOverrides(sessionId).feedEmpty ? [] : feedSessions.get(sessionId).postsState;
    return HttpResponse.json(apiResponse(pagedFeedResponse(posts, page), 'Feed retrieved successfully'));
  }),

  http.get('/api/posts/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const posts = feedSessions
      .get(sessionIdFromRequest(request))
      .postsState.filter((post) => post.groupId === groupId);
    return HttpResponse.json(apiResponse(mockPageResponse(posts), 'Group posts retrieved successfully'));
  }),

  http.get('/api/posts/hashtag/:tag', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const tag = decodeURIComponent(params.tag as string);
    const posts = feedSessions
      .get(sessionIdFromRequest(request))
      .postsState.filter((post) => post.hashtags.includes(tag));
    return HttpResponse.json(apiResponse(mockPageResponse(posts), 'Posts retrieved successfully'));
  }),

  http.get('/api/posts/broadcast', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    // MSW-1: replaces apiErrors.ts's overrideBroadcastsToError.
    if (getOverrides(sessionId).broadcastsError) {
      return HttpResponse.json(apiError('Simulated broadcasts failure'), { status: 500 });
    }
    // FEED-10: a genuine expiry filter (mirroring the real backend's
    // endpoint name/contract), not a hardcoded single-item array — proves
    // mockExpiredBroadcastPost's exclusion is real filtering, not just an
    // absent fixture.
    const now = new Date();
    const activeBroadcasts = feedSessions
      .get(sessionId)
      .broadcastsState.filter(
        (post) => post.broadcastEndTime === null || new Date(post.broadcastEndTime) > now,
      );
    return HttpResponse.json(
      apiResponse(mockPageResponse(activeBroadcasts), 'Active broadcasts retrieved successfully'),
    );
  }),

  // FEED-12: must stay after every literal-segment /api/posts/* GET handler
  // above (feed, group/:groupId, hashtag/:tag, broadcast) — msw matches
  // handlers in array order, and `:postId` would otherwise shadow those
  // literal routes (e.g. a request to /api/posts/feed would match `:postId`
  // first if this handler came before it).
  http.get('/api/posts/:postId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const post = feedSessions.get(sessionIdFromRequest(request)).postsState.find(
      (candidate) => candidate.id === postId,
    );
    if (!post) return HttpResponse.json(apiError('Post not found'), { status: 404 });
    return HttpResponse.json(apiResponse(post, 'Post retrieved successfully'));
  }),

  http.get('/api/hashtags/trending', ({ request }) => {
    // MSW-1: replaces apiErrors.ts's overrideTrendingToError.
    if (getOverrides(sessionIdFromRequest(request)).trendingError) {
      return HttpResponse.json(apiError('Simulated trending failure'), { status: 500 });
    }
    return HttpResponse.json(apiResponse(mockPageResponse([mockHashtag]), 'Trending hashtags retrieved'));
  }),

  http.post('/api/posts/:postId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    session.postsState = session.postsState.map((post) =>
      post.id === postId
        ? { ...post, isLikedByCurrentUser: true, likeCount: post.likeCount + 1 }
        : post,
    );
    return HttpResponse.json(apiResponse(null, 'Post liked successfully'));
  }),

  http.delete('/api/posts/:postId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    session.postsState = session.postsState.map((post) =>
      post.id === postId
        ? { ...post, isLikedByCurrentUser: false, likeCount: Math.max(0, post.likeCount - 1) }
        : post,
    );
    return HttpResponse.json(apiResponse(null, 'Post unliked successfully'));
  }),

  http.delete('/api/posts/:postId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    session.postsState = session.postsState.filter((post) => post.id !== postId);
    return HttpResponse.json(apiResponse(null, 'Post deleted successfully'));
  }),

  http.post('/api/posts', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    // MSW-1: replaces failCreatePostOnce.ts's overrideCreatePostToFailOnce —
    // consumed on read, so only the next create-post call is affected.
    if (consumeCreatePostFailOnce(sessionId)) {
      return HttpResponse.json(apiError('Simulated post-creation failure'), { status: 500 });
    }
    const body = (await request.json()) as CreatePostPayload;
    if (!body.content) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    // Mirrors PostServiceImpl.createPost's own cross-field validation: an
    // omitted postType defaults to USER_FEED, which then can't carry a
    // groupId. Without this check here, a client bug that forgets to send
    // postType: 'GROUP_POST' for a group post silently "succeeds" against
    // MSW while 400ing against the real backend (found once, for the Groups
    // page's composer — see useGroupsPageData.ts's createPost).
    const postType = body.postType ?? 'USER_FEED';
    if (postType === 'USER_FEED' && body.groupId != null) {
      return HttpResponse.json(
        apiError('USER_FEED posts cannot be associated with a group'),
        { status: 400 },
      );
    }
    const created: Post = {
      ...mockPost,
      id: Date.now(),
      content: body.content,
      postType,
      groupId: body.groupId ?? null,
      visibility: body.visibility ?? 'public',
      hashtags: [],
      likeCount: 0,
      commentCount: 0,
      isLikedByCurrentUser: false,
      // Real backend default (FEED-7): omitted broadcastEndTime -> now+24h.
      broadcastEndTime: postType === 'GROUP_BROADCAST' ? hoursFromNow(24) : null,
    };
    const session = feedSessions.get(sessionId);
    session.postsState = [created, ...session.postsState];
    // A GROUP_BROADCAST is still a regular post in its group's own feed
    // (postsState above) AND surfaces on the broadcasts rail — mirrors the
    // real backend's dual visibility, same reasoning broadcastsState was
    // split out for (FEED-10).
    if (postType === 'GROUP_BROADCAST') {
      session.broadcastsState = [created, ...session.broadcastsState];
    }
    return HttpResponse.json(apiResponse(created, 'Post created successfully'), { status: 201 });
  }),

  http.get('/api/posts/:postId/comments', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(
      apiResponse(mockPageResponse(session.commentsState[postId] ?? []), 'Comments retrieved successfully'),
    );
  }),

  http.post('/api/posts/:postId/comments', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    const body = (await request.json()) as CreateCommentPayload;
    if (!body.content) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const created: Comment = {
      id: Date.now(),
      postId,
      userId: mockUser.id,
      userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      userAvatarUrl: mockUser.avatarUrl,
      content: body.content,
      parentCommentId: body.parentCommentId ?? null,
      likeCount: 0,
      replyCount: 0,
      isLikedByCurrentUser: false,
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const session = feedSessions.get(sessionIdFromRequest(request));
    if (body.parentCommentId === undefined) {
      session.commentsState = {
        ...session.commentsState,
        [postId]: [created, ...(session.commentsState[postId] ?? [])],
      };
      bumpPostCommentCount(session, postId, 1);
    } else {
      session.commentsState = {
        ...session.commentsState,
        [postId]: (session.commentsState[postId] ?? []).map((comment) =>
          comment.id === body.parentCommentId
            ? { ...comment, replyCount: comment.replyCount + 1, replies: [...comment.replies, created] }
            : comment,
        ),
      };
    }
    return HttpResponse.json(apiResponse(created, 'Comment created successfully'), { status: 201 });
  }),

  http.delete('/api/posts/comments/:commentId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const commentId = Number(params.commentId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    const located = locateComment(session, commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });

    if (located.parentCommentId === null) {
      session.commentsState = {
        ...session.commentsState,
        [located.postId]: (session.commentsState[located.postId] ?? []).filter(
          (comment) => comment.id !== commentId,
        ),
      };
      bumpPostCommentCount(session, located.postId, -1);
    } else {
      session.commentsState = {
        ...session.commentsState,
        [located.postId]: (session.commentsState[located.postId] ?? []).map((comment) =>
          comment.id === located.parentCommentId
            ? {
                ...comment,
                replyCount: Math.max(0, comment.replyCount - 1),
                replies: comment.replies.filter((reply) => reply.id !== commentId),
              }
            : comment,
        ),
      };
    }
    return HttpResponse.json(apiResponse(null, 'Comment deleted successfully'));
  }),

  http.post('/api/posts/comments/:commentId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const commentId = Number(params.commentId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    const located = locateComment(session, commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformComment(session, located.postId, commentId, (comment) => ({
      ...comment,
      isLikedByCurrentUser: true,
      likeCount: comment.likeCount + 1,
    }));
    return HttpResponse.json(apiResponse(null, 'Comment liked successfully'));
  }),

  http.delete('/api/posts/comments/:commentId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const commentId = Number(params.commentId);
    const session = feedSessions.get(sessionIdFromRequest(request));
    const located = locateComment(session, commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformComment(session, located.postId, commentId, (comment) => ({
      ...comment,
      isLikedByCurrentUser: false,
      likeCount: Math.max(0, comment.likeCount - 1),
    }));
    return HttpResponse.json(apiResponse(null, 'Comment unliked successfully'));
  }),
];

/**
 * Test-only seed — lets a spec replace one session's postsState wholesale
 * (e.g. FEED-10's large paginated fixture) before it starts, while every
 * other handler above (like/unlike/comment/create/delete) keeps operating on
 * the same session's array unchanged. MSW-1: reached via the mock server's
 * `/__mock/sessions/:id/seed-paginated-feed` admin route (overrides.ts),
 * replacing the old addInitScript + dynamic-import + worker.use() mechanism.
 */
export function seedPostsState(sessionId: string, posts: Post[]): void {
  feedSessions.get(sessionId).postsState = posts;
}

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetFeedSession(sessionId: string): void {
  feedSessions.reset(sessionId);
}
