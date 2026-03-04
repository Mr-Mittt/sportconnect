package com.sportconnect.social.post.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommentResponse {
    
    private Long id;
    private Long postId;
    private UUID userId;
    private String userFullName;
    private String userAvatarUrl;
    private String content;
    private Long parentCommentId;
    private Long likeCount;
    private Boolean isLikedByCurrentUser;
    private List<CommentResponse> replies;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
