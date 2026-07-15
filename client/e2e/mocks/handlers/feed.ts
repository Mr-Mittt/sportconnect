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
  mockGroupPost,
  mockHashtag,
  mockPageResponse,
  mockPost,
  mockUser,
} from '../fixtures.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

// A small in-memory fake backend, not a fixed responder — FEED-1's optimistic
// like/unlike/delete mutations always reconcile via a background
// invalidate+refetch of GET /posts/feed (onSettled). A stateless GET handler
// would clobber the optimistic UI state the instant that refetch lands
// (confirmed: this exact bug was caught in useHomeFeedData's own Vitest
// suite before this handler was made stateful). A real backend would show
// the like as persisted on refetch, so this fixture needs to too.
let postsState: Post[] = [mockPost, mockGroupPost, mockBasketballPost];

// FEED-2's comment threads, keyed by postId — same "small stateful fake
// backend, not a fixed responder" reasoning as postsState above (comment
// mutations reconcile via invalidate+refetch too).
let commentsState: Record<number, Comment[]> = { [mockPost.id]: [mockComment] };

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

function bumpPostCommentCount(postId: number, delta: number): void {
  postsState = postsState.map((post) =>
    post.id === postId ? { ...post, commentCount: Math.max(0, post.commentCount + delta) } : post,
  );
}

/** Locates a comment (root or one-level reply) across every post's thread. */
function locateComment(
  commentId: number,
): { postId: number; parentCommentId: number | null } | null {
  for (const [postIdKey, comments] of Object.entries(commentsState)) {
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
  postId: number,
  commentId: number,
  transform: (comment: Comment) => Comment,
): void {
  commentsState = {
    ...commentsState,
    [postId]: (commentsState[postId] ?? []).map((comment) => {
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

export const feedHandlers: HttpHandler[] = [
  http.get('/api/posts/feed', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(
      apiResponse(mockPageResponse(postsState), 'Feed retrieved successfully'),
    );
  }),

  http.get('/api/posts/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const posts = postsState.filter((post) => post.groupId === groupId);
    return HttpResponse.json(apiResponse(mockPageResponse(posts), 'Group posts retrieved successfully'));
  }),

  http.get('/api/posts/hashtag/:tag', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const tag = decodeURIComponent(params.tag as string);
    const posts = postsState.filter((post) => post.hashtags.includes(tag));
    return HttpResponse.json(apiResponse(mockPageResponse(posts), 'Posts retrieved successfully'));
  }),

  http.get('/api/posts/broadcast', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(
      apiResponse(mockPageResponse([mockBroadcastPost]), 'Active broadcasts retrieved successfully'),
    );
  }),

  http.get('/api/hashtags/trending', () =>
    HttpResponse.json(apiResponse(mockPageResponse([mockHashtag]), 'Trending hashtags retrieved')),
  ),

  http.post('/api/posts/:postId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    postsState = postsState.map((post) =>
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
    postsState = postsState.map((post) =>
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
    postsState = postsState.filter((post) => post.id !== postId);
    return HttpResponse.json(apiResponse(null, 'Post deleted successfully'));
  }),

  http.post('/api/posts', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as CreatePostPayload;
    if (!body.content) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const created: Post = {
      ...mockPost,
      id: Date.now(),
      content: body.content,
      postType: body.postType ?? 'USER_FEED',
      groupId: body.groupId ?? null,
      visibility: body.visibility ?? 'public',
      hashtags: [],
      likeCount: 0,
      commentCount: 0,
      isLikedByCurrentUser: false,
    };
    postsState = [created, ...postsState];
    return HttpResponse.json(apiResponse(created, 'Post created successfully'), { status: 201 });
  }),

  http.get('/api/posts/:postId/comments', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const postId = Number(params.postId);
    return HttpResponse.json(
      apiResponse(mockPageResponse(commentsState[postId] ?? []), 'Comments retrieved successfully'),
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

    if (body.parentCommentId === undefined) {
      commentsState = { ...commentsState, [postId]: [created, ...(commentsState[postId] ?? [])] };
      bumpPostCommentCount(postId, 1);
    } else {
      commentsState = {
        ...commentsState,
        [postId]: (commentsState[postId] ?? []).map((comment) =>
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
    const located = locateComment(commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });

    if (located.parentCommentId === null) {
      commentsState = {
        ...commentsState,
        [located.postId]: (commentsState[located.postId] ?? []).filter(
          (comment) => comment.id !== commentId,
        ),
      };
      bumpPostCommentCount(located.postId, -1);
    } else {
      commentsState = {
        ...commentsState,
        [located.postId]: (commentsState[located.postId] ?? []).map((comment) =>
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
    const located = locateComment(commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformComment(located.postId, commentId, (comment) => ({
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
    const located = locateComment(commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformComment(located.postId, commentId, (comment) => ({
      ...comment,
      isLikedByCurrentUser: false,
      likeCount: Math.max(0, comment.likeCount - 1),
    }));
    return HttpResponse.json(apiResponse(null, 'Comment unliked successfully'));
  }),
];
