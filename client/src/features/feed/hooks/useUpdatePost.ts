import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { updatePostInFeedCaches } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreatePostPayload, Post } from '../types';

interface UpdatePostVariables {
  postId: number;
  payload: CreatePostPayload;
}

/**
 * Wraps PUT /api/posts/{postId}. Owner-only for a regular post; for a
 * GROUP_BROADCAST, the group's owner/admin may also update it (verified
 * against `PostServiceImpl.updatePost`'s `isBroadcastModerator` check) — this
 * is what FEED-7's "update the existing active broadcast instead of creating
 * a second one" flow uses.
 *
 * **Backend quirk, not fixed here (client-only ticket):** the endpoint sets
 * `content`/`locationName`/`sportId` unconditionally from the request body —
 * omitting a field nulls it out server-side, it isn't a partial patch.
 * Callers must echo back the target post's existing `locationName`/`sportId`
 * (and `visibility`, though that one IS conditionally applied) if they want
 * to preserve them; FEED-7's broadcast-update flow does this.
 *
 * onSuccess splices the real server-returned post directly into every
 * mounted Post-feed query (personal/group/hashtag) — same "no full refetch"
 * reasoning as useCreatePost/useDeletePost. `feedKeys.broadcasts()` isn't a
 * Post-feed-shaped cache (`useActiveBroadcasts` is a plain `useQuery`, not
 * infinite), so it isn't touched here — onSettled's invalidate picks it up
 * in the background instead.
 */
export function useUpdatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, payload }: UpdatePostVariables) => {
      const response = await apiClient.put<ApiResponse<Post>>(`/posts/${postId}`, payload);
      return response.data.data;
    },
    onSuccess: (updatedPost) => {
      updatePostInFeedCaches(queryClient, updatedPost.id, () => updatedPost);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
