import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { CreatePostPayload, Post } from '../../../src/features/feed/types.ts';
import {
  mockBroadcastPost,
  mockGroup,
  mockGroupPost,
  mockHashtag,
  mockPageResponse,
  mockPost,
} from '../fixtures.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

const feedPosts = [mockGroupPost, mockPost];

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

export const feedHandlers: HttpHandler[] = [
  http.get('/api/posts/feed', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(apiResponse(mockPageResponse(feedPosts), 'Feed retrieved successfully'));
  }),

  http.get('/api/posts/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const posts = feedPosts.filter((post) => post.groupId === groupId);
    return HttpResponse.json(apiResponse(mockPageResponse(posts), 'Group posts retrieved successfully'));
  }),

  http.get('/api/posts/hashtag/:tag', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const tag = decodeURIComponent(params.tag as string);
    const posts = feedPosts.filter((post) => post.hashtags.includes(tag));
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

  http.get('/api/groups/user/:userId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(apiResponse(mockPageResponse([mockGroup])));
  }),

  http.post('/api/posts/:postId/like', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(apiResponse(null, 'Post liked successfully'));
  }),

  http.delete('/api/posts/:postId/like', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(apiResponse(null, 'Post unliked successfully'));
  }),

  http.delete('/api/posts/:postId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
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
    return HttpResponse.json(apiResponse(created, 'Post created successfully'), { status: 201 });
  }),
];
