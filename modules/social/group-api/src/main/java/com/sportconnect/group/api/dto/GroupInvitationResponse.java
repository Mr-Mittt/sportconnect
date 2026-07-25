package com.sportconnect.group.api.dto;

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
public class GroupInvitationResponse {
    private Long id;
    private Long groupId;
    private String groupName;
    /**
     * B15: the invited group's sport id (the group's own {@code sportId}, never null in practice).
     * No {@code sportName} field — sports are static reference data already exposed in full via
     * {@code GET /api/sports}; clients resolve the display name from that already-fetched list
     * rather than the backend joining it in on every invitation row.
     */
    private Long sportId;
    private UUID inviterId;
    private String inviterFullName;
    /**
     * B14: every member who has invited this invitee to this group, oldest-first — a singleton
     * list containing just {@link #inviterFullName} in the common single-inviter case. Kept
     * alongside the singular {@code inviterId}/{@code inviterFullName} fields (unchanged, still
     * "who originally created this row") for backward compatibility.
     */
    private List<String> inviterFullNames;
    private UUID inviteeId;
    private String inviteeFullName;
    private String status;
    private UUID reviewedBy;
    private LocalDateTime reviewedAt;
    private String rejectReason;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
