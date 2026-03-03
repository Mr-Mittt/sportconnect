package com.sportconnect.social.api.service;

import com.sportconnect.social.api.dto.CreatePostRequest;
import com.sportconnect.social.api.dto.PostResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface PostService {
    
    PostResponse createPost(UUID userId, CreatePostRequest request);
    
    PostResponse getPostById(Long postId, UUID currentUserId);
    
    Page<PostResponse> getUserPosts(UUID userId, UUID currentUserId, Pageable pageable);
    
    Page<PostResponse> getPublicFeed(UUID currentUserId, Pageable pageable);
    
    PostResponse updatePost(Long postId, UUID userId, CreatePostRequest request);
    
    void deletePost(Long postId, UUID userId);
    
    void likePost(Long postId, UUID userId);
    
    void unlikePost(Long postId, UUID userId);
}
