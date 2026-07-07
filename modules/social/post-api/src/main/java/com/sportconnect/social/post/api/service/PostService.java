package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface PostService {

    PostResponse createPost(UUID userId, CreatePostRequest request);

    PostResponse getPostById(Long postId, UUID currentUserId);

    /**
     * Batch equivalent of {@link #getPostById}, for callers resolving several posts by id at
     * once (e.g. a group's pinned posts) — avoids one query per post. Posts that don't exist or
     * are soft-deleted are silently absent from the result map rather than throwing, since a
     * caller resolving several ids at once typically wants to render what it can and skip the
     * rest (see {@code GroupServiceImpl.getPinnedPosts}).
     */
    Map<Long, PostResponse> getPostsByIds(List<Long> postIds, UUID currentUserId);
    
    Page<PostResponse> getUserPosts(UUID userId, UUID currentUserId, Pageable pageable);
    
    Page<PostResponse> getPersonalizedFeed(UUID callerId, Pageable pageable);
    
    Page<PostResponse> getGroupPosts(Long groupId, UUID currentUserId, Pageable pageable);
    
    PostResponse updatePost(Long postId, UUID userId, CreatePostRequest request);
    
    void deletePost(Long postId, UUID userId);
    
    void likePost(Long postId, UUID userId);

    void unlikePost(Long postId, UUID userId);

    Page<PostResponse> getPostsByHashtag(String tag, UUID currentUserId, Pageable pageable);

    Page<PostResponse> getActiveBroadcasts(UUID callerId, Pageable pageable);

    PostResponse updateBroadcastEndTime(Long postId, UUID callerId, LocalDateTime newEndTime);
}
