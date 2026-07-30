package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
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

    /** Same gating as updateSession. Rejected with BadRequestException if status == COMPLETED. */
    void deleteSession(Long sessionId, UUID userId);

    /**
     * Group-linked requires GroupService.isGroupMember; standalone is open to any caller.
     * Upserts SessionParticipant — an existing LEFT row flips back to JOINED rather than a
     * duplicate insert.
     */
    void joinSession(Long sessionId, UUID userId);

    /** Requires an existing JOINED row; flips it to LEFT. BadRequestException otherwise. */
    void leaveSession(Long sessionId, UUID userId);

    /** JOINED participants only. */
    Page<SessionParticipantResponse> getSessionParticipants(Long sessionId, Pageable pageable);
}
