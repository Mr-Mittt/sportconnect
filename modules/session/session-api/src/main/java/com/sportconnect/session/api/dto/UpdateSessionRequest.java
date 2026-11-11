package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

/** Partial update — only non-null fields are applied. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateSessionRequest {

    @Size(max = 200, message = "title must not exceed 200 characters")
    private String title;

    @Size(max = 5000, message = "description must not exceed 5000 characters")
    private String description;

    private Long locationId;

    @Size(max = 500, message = "locationNote must not exceed 500 characters")
    private String locationNote;

    /** SESSION-33: offset-aware instant — see {@code CreateSessionRequest.scheduledStart}'s
     * Javadoc. */
    private Instant scheduledStart;

    private Integer durationMinutes;

    @Min(value = 0, message = "capacity must be >= 0")
    private Integer capacity;

    private FeeType feeType;

    /** Meaningful only when the resolved feeType (after this update) is FIXED — see
     * SessionServiceImpl.updateSession. */
    private Long feeAmountVnd;

    private Boolean autoApprove;

    @Min(value = 0, message = "initialSlot must be >= 0")
    private Integer initialSlot;

    /** SESSION-46 — non-null replaces, null leaves, {@code 0} clears. Same open-seat rule as on
     * create, checked on the resulting values. */
    @Min(value = 0, message = "maleSlots must be >= 0")
    private Integer maleSlots;

    @Min(value = 0, message = "femaleSlots must be >= 0")
    private Integer femaleSlots;

    /** SESSION-46 — optional on update; 1 to 10. */
    @Min(value = 1, message = "gameMood must be between 1 and 10")
    @Max(value = 10, message = "gameMood must be between 1 and 10")
    private Integer gameMood;

    /** SESSION-46 — non-null replaces, empty string clears, null leaves. */
    @Size(max = 300, message = "feeNote must not exceed 300 characters")
    private String feeNote;

    /** SESSION-23 — replace-semantics: a non-null map is filtered against the sport's session
     * attribute schema (A17) and stored wholesale, replacing whatever was there. {@code null}
     * (or omitted) leaves the stored attributes untouched; an explicit empty map clears them.
     * Same server-side filtering and 4KB cap as {@code CreateSessionRequest.attributes}. */
    private Map<String, Object> attributes;
}
