package com.sportconnect.social.post.api.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateBroadcastEndTimeRequest {

    @NotNull(message = "broadcastEndTime is required")
    private LocalDateTime broadcastEndTime;
}
