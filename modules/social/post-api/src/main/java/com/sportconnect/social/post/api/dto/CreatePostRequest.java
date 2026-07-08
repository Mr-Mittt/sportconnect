package com.sportconnect.social.post.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreatePostRequest {

    @NotBlank(message = "Content is required")
    @Size(max = 5000, message = "Content must not exceed 5000 characters")
    private String content;

    private Double latitude;

    private Double longitude;

    private String locationName;

    private Long sportId;

    private Long groupId;

    private PostType postType;

    @Schema(description = "public, friends, or private")
    private String visibility;

    private List<String> mediaUrls;

    @Schema(description = "Optional; GROUP_BROADCAST only, defaults to now()+24h if omitted")
    private LocalDateTime broadcastEndTime;
}
