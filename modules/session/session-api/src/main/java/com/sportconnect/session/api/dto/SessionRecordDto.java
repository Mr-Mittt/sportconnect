package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-50: one recorded result of a session.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionRecordDto {

    private Long id;
    /** The payload as the client sent it; players, sides, winner and scores all live inside. */
    private Map<String, Object> data;
    private UUID createdBy;
    private Instant createdAt;
    private UUID updatedBy;
    private Instant updatedAt;
}
