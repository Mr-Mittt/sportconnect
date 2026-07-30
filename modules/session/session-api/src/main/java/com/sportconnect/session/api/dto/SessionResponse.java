package com.sportconnect.session.api.dto;

import com.sportconnect.location.api.dto.LocationResponse;
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
public class SessionResponse {

    private Long id;

    private Long groupId;

    private SessionType sessionType;

    private UUID createdBy;

    private String createdByFullName;

    private Long sportId;

    private String sportName;

    private String title;

    private String description;

    private LocationResponse location;

    private String locationNote;

    private LocalDateTime scheduledStart;

    private LocalDateTime scheduledEndAt;

    private SessionStatus status;

    private Long participantCount;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
