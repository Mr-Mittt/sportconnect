package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** SESSION-55: a session linked to a MANUAL season. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeasonLinkedSessionResponse {

    private Long sessionId;
    private String title;
    private Instant scheduledStart;
    private SessionStatus status;
}
