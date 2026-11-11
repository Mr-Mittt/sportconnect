package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Max;
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

    /** SESSION-46 — informational open slots for male players, {@code >= 0}. Together with
     * {@code femaleSlots} must not exceed {@code capacity - initialSlot}
     * (400 {@code SESSION_GENDER_SLOTS_EXCEED_OPEN}). Omitted = not specified. */
    @Min(value = 0, message = "maleSlots must be >= 0")
    private Integer maleSlots;

    /** SESSION-46 — same as {@code maleSlots}, for female players. */
    @Min(value = 0, message = "femaleSlots must be >= 0")
    private Integer femaleSlots;

    /** SESSION-46 — 1 (for fun) to 10 (competitive). Required. */
    @NotNull(message = "gameMood is required")
    @Min(value = 1, message = "gameMood must be between 1 and 10")
    @Max(value = 10, message = "gameMood must be between 1 and 10")
    private Integer gameMood;

    /** SESSION-46 — note about the fee, any fee type; trimmed, blank stored as null. */
    @Size(max = 300, message = "feeNote must not exceed 300 characters")
    private String feeNote;

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
