package com.sportconnect.group.api.dto;

import com.sportconnect.social.post.api.dto.PostResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PinnedPostResponse {

    private Long postId;
    private UUID pinnedBy;
    private LocalDateTime pinnedAt;
    private PostResponse post;
}
