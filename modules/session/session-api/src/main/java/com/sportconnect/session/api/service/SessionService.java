package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface SessionService {

    /**
     * groupId null → standalone (open to any ROLE_USER, sportId required in the request).
     * groupId non-null → requires GroupService.canManageMembers; sportId inherited from the
     * group if omitted. In both cases locationId must resolve to a Location whose sportId
     * matches the session's resolved sportId — a BadRequestException otherwise.
     */
    SessionResponse createSession(UUID userId, CreateSessionRequest request);

    SessionResponse getSession(Long sessionId);

    /**
     * Delegates private-group visibility to GroupService.getGroup(groupId, currentUserId) before
     * querying — reuses the existing membership gate rather than reimplementing it.
     */
    Page<SessionResponse> getGroupSessions(Long groupId, UUID currentUserId, Pageable pageable);

    Page<SessionResponse> getSessionsCreatedByUser(UUID userId, Pageable pageable);

    /** Standalone → creator-only. Group-linked → owner/admin via canManageMembers. */
    SessionResponse updateSession(Long sessionId, UUID userId, UpdateSessionRequest request);

    /**
     * Same gating as updateSession. A soft action — the row is kept with status=CANCELLED plus
     * cancelReason/cancelledBy/cancelledAt, never deleted. Rejected with BadRequestException if
     * the session is already COMPLETED or CANCELLED.
     */
    SessionResponse cancelSession(Long sessionId, UUID userId, CancelSessionRequest request);

    /**
     * Group-linked requires GroupService.isGroupMember; standalone is open to any caller.
     * Upserts SessionParticipant — an existing LEFT row flips back to JOINED rather than a
     * duplicate insert.
     */
    void joinSession(Long sessionId, UUID userId);

    /** Requires an existing JOINED row; flips it to LEFT. BadRequestException otherwise. */
    void leaveSession(Long sessionId, UUID userId);

    /**
     * status omitted → JOINED, public (unchanged contract). Any other status (in practice
     * REQUESTED, the approval queue, or INVITED) requires the caller to pass requireCanModify's
     * gate — creator for standalone, owner/admin for group-linked — same as
     * cancelSession/updateSession.
     */
    Page<SessionParticipantResponse> getSessionParticipants(
            Long sessionId, UUID callerId, ParticipantStatus status, Pageable pageable);

    /**
     * Transitions a REQUESTED row to JOINED. Same gating as cancelSession/updateSession.
     * BadRequestException if the session is CANCELLED or no REQUESTED row exists for userId
     * (an INVITED row isn't approvable here — only the invitee's own joinSession call resolves
     * it).
     */
    void approveParticipant(Long sessionId, UUID callerId, UUID userId);

    /**
     * Transitions a REQUESTED row to LEFT, persisting the optional reason. Same
     * gating/exceptions as approveParticipant.
     */
    void rejectParticipant(Long sessionId, UUID callerId, UUID userId, RejectParticipantRequest request);

    /**
     * Standalone sessions (groupId null) the caller can discover and join: status SCHEDULED,
     * restricted to sports the caller holds an active UserSportProfile for, excluding sessions
     * the caller created (see getSessionsCreatedByUser) and sessions the caller currently has a
     * JOINED participant row for. If sportId is given but isn't one of the caller's active
     * sports, returns an empty page rather than throwing. A caller with zero active sport
     * profiles also gets an empty page.
     */
    Page<SessionResponse> discoverSessions(UUID callerId, Long sportId, Pageable pageable);

    /**
     * Sessions (standalone or group-linked) the caller currently has a JOINED participant row
     * for, restricted to a single status — backs per-status sections on the matches page (e.g.
     * "joined + ongoing", "joined + completed").
     */
    Page<SessionResponse> getJoinedSessions(UUID userId, SessionStatus status, Pageable pageable);
}
