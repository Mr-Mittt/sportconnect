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
public class PostResponse {
    
    private Long id;
    private UUID userId;
    private String userFullName;
    private String userAvatarUrl;
    private PostType postType;
    private Long groupId;
    private String content;
    private Double latitude;
    private Double longitude;
    private String locationName;
    private Long sportId;
    private String visibility;
    private List<PostMediaResponse> media;
    private List<String> hashtags;
    private List<CommentResponse> previewComments;
    private Long likeCount;
    private Long commentCount;
    private Long shareCount;
    private Boolean isLikedByCurrentUser;
    /** SESSION-GL-63: the code of a {@code GROUP_SYSTEM} post (null for every other post and for a welcome post written before codes). */
    private SystemCode systemCode;
    /** SESSION-GL-63: the params of {@link #systemCode} (for example {@code name}); null when there is no code. */
    private Map<String, String> systemParams;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime broadcastEndTime;
}
