package com.sportconnect.group.api.dto;

import com.sportconnect.social.post.api.dto.PostResponse;
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
public class GroupResponse {
    private Long id;
    private Long sportId;
    /** B25: the group's country and region (reference ids) and its timezone, derived from them (the region's, else the country's; null if the reference data has none). */
    private Long countryId;
    private Long regionId;
    private String timezone;
    private String groupName;
    private String description;
    private String avatarUrl;
    private String coverUrl;
    private Boolean isPrivate;
    private Boolean isActive;
    private UUID createdBy;
    private String createdByFullName;
    private Integer memberCount;
    private String currentUserRole;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** Top 3 pinned posts, latest first. Null except on getGroup(). */
    private List<PostResponse> pinnedPosts;
}
