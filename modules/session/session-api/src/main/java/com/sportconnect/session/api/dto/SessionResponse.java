package com.sportconnect.session.api.dto;

import com.sportconnect.location.api.dto.LocationResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionResponse {

    private Long id;

    private Long groupId;

    private SessionType sessionType;

    private UUID createdBy;

    private String createdByFullName;

    private Long sportId;

    private String sportName;

    private String title;

    private String description;

    private LocationResponse location;

    private String locationNote;

    private LocalDateTime scheduledStart;

    private LocalDateTime scheduledEndAt;

    private SessionStatus status;

    private String cancelReason;

    private UUID cancelledBy;

    private String cancelledByFullName;

    private LocalDateTime cancelledAt;

    /** Real JOINED SessionParticipant rows + initialSlot — not a raw participant-table count. */
    private Long participantCount;

    private Integer capacity;

    /** The initialSlot value folded into participantCount above — exposed separately so a future
     * edit screen can show/update it on its own, same as capacity/feeType. */
    private Integer initialSlot;

    private FeeType feeType;

    private Long feeAmountVnd;

    private Boolean autoApprove;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
