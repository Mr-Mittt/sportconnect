package com.sportconnect.social.post.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
    private CommentType commentType;
    /** SESSION-GL-63: the code of a system entry (null for a user's comment and for a system entry written before codes). */
    private SystemCode systemCode;
    /** SESSION-GL-63: the params of {@link #systemCode} (for example {@code name}); null when there is no code. */
    private Map<String, String> systemParams;
    private Long parentCommentId;
    private Long likeCount;
    private Long replyCount;
    private Boolean isLikedByCurrentUser;
    private List<CommentResponse> replies;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
