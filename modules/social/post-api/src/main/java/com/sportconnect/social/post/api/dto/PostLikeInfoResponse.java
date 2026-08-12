package com.sportconnect.social.post.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PostLikeInfoResponse {

    private Long likeCount;

    private Boolean isLikedByCurrentUser;
}
