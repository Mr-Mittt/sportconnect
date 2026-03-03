package com.sportconnect.social.api.dto;

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
public class PostResponse {
    
    private Long id;
    private UUID userId;
    private String userFullName;
    private String userAvatarUrl;
    private String content;
    private Double latitude;
    private Double longitude;
    private String locationName;
    private Long sportId;
    private String sportName;
    private String visibility;
    private List<PostMediaResponse> media;
    private List<String> hashtags;
    private Long likeCount;
    private Long commentCount;
    private Long shareCount;
    private Boolean isLikedByCurrentUser;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
