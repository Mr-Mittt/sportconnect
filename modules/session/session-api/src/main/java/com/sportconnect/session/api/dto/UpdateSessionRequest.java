package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
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

    private LocalDateTime scheduledStart;

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

    /** SESSION-23 — replace-semantics: a non-null map is filtered against the sport's session
     * attribute schema (A17) and stored wholesale, replacing whatever was there. {@code null}
     * (or omitted) leaves the stored attributes untouched; an explicit empty map clears them.
     * Same server-side filtering and 4KB cap as {@code CreateSessionRequest.attributes}. */
    private Map<String, Object> attributes;
}
