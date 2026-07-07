package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.UUID;

public interface PostService {
    
    PostResponse createPost(UUID userId, CreatePostRequest request);
    
    PostResponse getPostById(Long postId, UUID currentUserId);
    
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
