package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateSessionRequest {

    /** Null = standalone session. Non-null = group-linked, gated on canManageMembers. */
    private Long groupId;

    /** Required when groupId is null; inherited from the group otherwise if omitted. */
    private Long sportId;

    @Size(max = 200, message = "title must not exceed 200 characters")
    private String title;

    @Size(max = 5000, message = "description must not exceed 5000 characters")
    private String description;

    @NotNull(message = "locationId is required")
    private Long locationId;

    @Size(max = 500, message = "locationNote must not exceed 500 characters")
    private String locationNote;

    @NotNull(message = "scheduledStart is required")
    private LocalDateTime scheduledStart;

    private Integer durationMinutes;
}
