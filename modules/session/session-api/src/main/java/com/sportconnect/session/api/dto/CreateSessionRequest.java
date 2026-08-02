package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

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

    @NotNull(message = "capacity is required")
    @Min(value = 0, message = "capacity must be >= 0")
    private Integer capacity;

    @NotNull(message = "feeType is required")
    private FeeType feeType;

    /** Required when feeType is FIXED, ignored otherwise — enforced in SessionServiceImpl. */
    private Long feeAmountVnd;

    /** Omitted → false (not mandatory like capacity/feeType). false = non-invited joiners land
     * in PENDING, awaiting creator/owner-admin approval. */
    private Boolean autoApprove;

    /** Pre-creates an INVITED SessionParticipant row per id — bypasses the autoApprove gate once
     * that user calls joinSession (resolves straight to JOINED). The caller's own id and
     * duplicates are silently ignored, not rejected. */
    private List<UUID> inviteeIds;
}
