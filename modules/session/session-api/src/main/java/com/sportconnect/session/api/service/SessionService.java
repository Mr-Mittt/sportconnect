package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface SessionService {

    /**
     * groupId null → standalone (open to any ROLE_USER, sportId required in the request).
     * groupId non-null → requires GroupService.canManageMembers; sportId inherited from the
     * group if omitted. In both cases locationId must resolve to a Location whose sportId
     * matches the session's resolved sportId — a BadRequestException otherwise.
     */
    SessionResponse createSession(UUID userId, CreateSessionRequest request);

    /** callerId (SESSION-9) resolves SessionResponse.callerParticipation — the caller's own
     * SessionParticipant row for this session, or null if they have none. */
    SessionResponse getSession(Long sessionId, UUID callerId);

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

    /**
     * Requires an existing JOINED, INVITED, or REQUESTED row; flips it to LEFT.
     * BadRequestException if no such row exists. Doubles as "decline" for an INVITED row and
     * "cancel my request" for a REQUESTED one (SESSION-9) — same endpoint as a plain leave, the
     * client just labels the button differently based on the caller's current status. Unlike
     * rejectParticipant, never sets rejectReason (that field is reserved for manager-initiated
     * rejection). SESSION-14: rejects with BadRequestException when the caller is the creator of
     * a standalone session (groupId null) — cancelSession is their only way out; not enforced for
     * a group-linked session's creator, who isn't auto-joined and can leave like any other member
     * if they choose to join one.
     */
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
     * for. {@code status} null returns every status in one page (CLIENT-SESSION-6's single
     * "My sessions" panel, avoiding a 4-call fan-out across SCHEDULED/ONGOING/COMPLETED/
     * CANCELLED); a given status restricts to just that one, same as before this parameter
     * became optional.
     */
    Page<SessionResponse> getJoinedSessions(UUID userId, SessionStatus status, Pageable pageable);

    /**
     * SESSION-10/A17 — the only path to a session's comment thread; {@code post-impl}'s own {@code
     * PostGate} makes the underlying {@code SESSION_POST} unconditionally unavailable via {@code
     * /api/posts/**}, so this module owns both the authorization (participant status —
     * JOINED/REQUESTED/INVITED — or, for a group-linked session, group membership; the ADR §6
     * widened rule) and the delegation to {@code post-api}'s bypass method
     * ({@code CommentService.createSessionComment}, which skips {@code PostGate}). Throws {@code
     * ResourceNotFoundException} if the session doesn't exist or its parent group is inactive,
     * {@code ForbiddenException} if it exists but {@code userId} isn't authorized.
     */
    CommentResponse createSessionComment(Long sessionId, UUID userId, CreateCommentRequest request);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    Page<CommentResponse> getSessionComments(Long sessionId, UUID callerId, Pageable pageable);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    void likeSessionComment(Long sessionId, Long commentId, UUID userId);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    void unlikeSessionComment(Long sessionId, Long commentId, UUID userId);

    /**
     * Like the session itself (its {@code SESSION_POST} anchor) — same authorization contract as
     * {@link #createSessionComment}, delegating to {@code post-api}'s {@code
     * PostService.likeSessionPost} bypass method.
     */
    void likeSession(Long sessionId, UUID userId);

    /** Same authorization/delegation contract as {@link #likeSession}. */
    void unlikeSession(Long sessionId, UUID userId);

    /**
     * Distinct participant ids for one session matching any of {@code statuses} — batch,
     * no-N+1-shaped lookup for {@code notification-impl}'s fan-out recipient resolution
     * (NTF-2: {@code session.comment.created}/{@code session.participant.joined}), same shape as
     * {@code post-api}'s {@code getDistinctCommenterIds}. Returns an empty list without querying
     * participants at all if the session doesn't exist or its own status isn't {@code SCHEDULED}
     * or {@code ONGOING} — a {@code CANCELLED}/{@code COMPLETED} session never triggers a
     * participant fan-out, even for an event published before it changed status.
     */
    List<UUID> getParticipantIdsByStatuses(Long sessionId, List<ParticipantStatus> statuses);

    /**
     * Batch title lookup, no-N+1-shaped like {@code getParticipantIdsByStatuses} — for
     * {@code notification-impl}'s {@code entityTitle} enrichment (NTF-4), resolving many
     * {@code entityId}s from one page of notifications in a single call rather than one
     * {@code getSession} per row. Missing ids are simply absent from the returned map, mirroring
     * {@code user-api}'s {@code getUsersByIds} semantics — no exception thrown.
     */
    Map<Long, String> getSessionTitlesByIds(List<Long> sessionIds);
}
