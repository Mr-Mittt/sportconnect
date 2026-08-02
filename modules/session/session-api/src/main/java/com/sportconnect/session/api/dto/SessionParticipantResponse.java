package com.sportconnect.session.api.dto;

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
public class SessionParticipantResponse {

    private Long id;

    private Long sessionId;

    private UUID userId;

    private String userFullName;

    private String userAvatarUrl;

    private ParticipantStatus status;

    private String rejectReason;

    private LocalDateTime createdAt;
}
