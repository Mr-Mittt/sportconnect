package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
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

    /** SESSION-24: optional — omitted (or null) means the session starts {@code PREPARING}
     * instead of {@code SCHEDULED}, until the creator completes it via {@code updateSession}. */
    private Long locationId;

    @Size(max = 500, message = "locationNote must not exceed 500 characters")
    private String locationNote;

    /** SESSION-33: offset-aware instant, e.g. {@code "2026-09-20T07:00:00+07:00"} — Jackson
     * rejects an offset-less string with a 400, an intentional, non-additive contract break (see
     * documentation/md/LOCATION_TIMEZONE_DESIGN.md). Not reinterpreted through locationId's
     * timezone in any way; stored exactly as the UTC instant this offset implies. */
    @NotNull(message = "scheduledStart is required")
    private Instant scheduledStart;

    private Integer durationMinutes;

    /** SESSION-33: the creator's own browser zone (IANA id, e.g. {@code "Asia/Bangkok"}), used
     * only when locationId is omitted — silently dropped by the server otherwise. Optional; not
     * yet sent by today's client (CLIENT-SESSION-24 wires this up). */
    private String originZoneId;

    @NotNull(message = "capacity is required")
    @Min(value = 0, message = "capacity must be >= 0")
    private Integer capacity;

    /** SESSION-24: optional — omitted (or null) means the session starts {@code PREPARING}
     * instead of {@code SCHEDULED}, until the creator completes it via {@code updateSession}. */
    private FeeType feeType;

    /** Required when feeType is FIXED, ignored otherwise — enforced in SessionServiceImpl. */
    private Long feeAmountVnd;

    /** Participants already accounted for outside the app — added on top of the real joined
     * count when participantCount is reported. Omitted -> 0 (not mandatory like capacity/feeType). */
    @Min(value = 0, message = "initialSlot must be >= 0")
    private Integer initialSlot;

    /** Omitted → false (not mandatory like capacity/feeType). false = non-invited joiners land
     * in PENDING, awaiting creator/owner-admin approval. */
    private Boolean autoApprove;

    /** Pre-creates an INVITED SessionParticipant row per id — bypasses the autoApprove gate once
     * that user calls joinSession (resolves straight to JOINED). The caller's own id and
     * duplicates are silently ignored, not rejected. */
    private List<UUID> inviteeIds;

    /** SESSION-23 — sport-specific structured attributes, keyed by the attribute path from the
     * sport's session attribute schema (A17). Filtered on the server against that schema: unknown
     * keys, wrong-shaped values, and writes to a switched-off attribute are dropped silently; the
     * surviving map is stored wholesale. Omitted → the session carries no attributes. Fails with
     * 400 only if the filtered map still serializes to more than 4KB. */
    private Map<String, Object> attributes;
}
