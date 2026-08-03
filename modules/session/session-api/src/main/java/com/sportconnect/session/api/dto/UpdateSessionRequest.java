package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

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
}
