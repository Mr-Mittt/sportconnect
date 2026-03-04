package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface CommentService {
    
    CommentResponse createComment(Long postId, UUID userId, CreateCommentRequest request);
    
    Page<CommentResponse> getPostComments(Long postId, UUID currentUserId, Pageable pageable);
    
    void deleteComment(Long commentId, UUID userId);
    
    void likeComment(Long commentId, UUID userId);
    
    void unlikeComment(Long commentId, UUID userId);
}
