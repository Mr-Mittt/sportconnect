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

    /** The calling user's own SessionParticipant row for this session (SESSION-9) — null if they
     * have none. userFullName/userAvatarUrl are left unset here (the caller already knows their
     * own identity); only status/rejectReason/createdAt/id are meaningful. Drives the client's
     * Join/Accept/Decline/Cancel/Leave button on both the session card and SessionDetailModal:
     * null or LEFT -> Join, INVITED -> Accept/Decline, REQUESTED -> Cancel, JOINED -> Leave. */
    private SessionParticipantResponse callerParticipation;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
