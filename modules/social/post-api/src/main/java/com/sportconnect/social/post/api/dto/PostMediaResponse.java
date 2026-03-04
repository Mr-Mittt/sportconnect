package com.sportconnect.social.post.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PostMediaResponse {
    
    private Long id;
    private String mediaType; // image, video
    private String mediaUrl;
    private String thumbnailUrl;
    private Integer displayOrder;
}
