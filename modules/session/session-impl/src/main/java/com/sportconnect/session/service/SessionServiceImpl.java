package com.sportconnect.session.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.access.SessionGate;
import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.event.SessionCommentCreatedEvent;
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent;
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent;
import com.sportconnect.session.api.service.SessionService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.PostLikeInfoResponse;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionServiceImpl implements SessionService {

    private final SessionRepository sessionRepository;
    private final SessionParticipantRepository sessionParticipantRepository;
    private final GroupService groupService;
    private final LocationService locationService;
    private final UserService userService;
    private final SportService sportService;
    private final UserSportProfileService userSportProfileService;
    // SESSION-10/A17: session-impl -> post-api is one-way — post-impl has no dependency back on
    // session-api (PostGate makes SESSION_POST unconditionally unavailable via /api/posts/**), so
    // there's no circular bean dependency here and no @Lazy needed, unlike GroupServiceImpl's own
    // postService field (which mirrors group-impl <-> post-impl's real bidirectional dependency).
    private final PostService postService;
    private final CommentService commentService;
    private final SessionGate sessionGate;
    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public SessionResponse createSession(UUID userId, CreateSessionRequest request) {
        Long groupId = request.getGroupId();
        Long sportId;
        SessionType sessionType;

        if (groupId != null) {
            if (!groupService.canManageMembers(groupId, userId)) {
                throw new BadRequestException("Only group owners and admins can create sessions for this group");
            }
            GroupResponse group = groupService.getGroup(groupId, userId);
            sportId = request.getSportId() != null ? request.getSportId() : group.getSportId();
            sessionType = SessionType.GROUP_RECURRING;
        } else {
            if (request.getSportId() == null) {
                throw new BadRequestException("sportId is required for a standalone session");
            }
            sportId = request.getSportId();
            sessionType = SessionType.STANDALONE;
        }

        LocationResponse location = locationService.getLocation(request.getLocationId());
        if (!Objects.equals(location.getSportId(), sportId)) {
            throw new BadRequestException("locationId does not match this session's sport");
        }

        LocalDateTime scheduledEndAt = request.getDurationMinutes() != null
                ? request.getScheduledStart().plusMinutes(request.getDurationMinutes())
                : null;

        Long feeAmountVnd = resolveFeeAmountVnd(request.getFeeType(), request.getFeeAmountVnd());
        boolean autoApprove = Boolean.TRUE.equals(request.getAutoApprove());
        int initialSlot = request.getInitialSlot() != null ? request.getInitialSlot() : 0;

        // SESSION-10/A17: the companion SESSION_POST is created first, inline in this same
        // @Transactional method, so a failure here rolls back the whole session creation instead
        // of leaving a session with no comment-thread anchor. post-impl never sees a sessionId —
        // it hands back the new post's id, which becomes this session's own postId.
        Long postId = postService.createSessionPost(userId, "Session: " + request.getTitle());

        Session session = Session.builder()
                .groupId(groupId)
                .postId(postId)
                .sessionType(sessionType)
                .createdBy(userId)
                .sportId(sportId)
                .title(request.getTitle())
                .description(request.getDescription())
                .locationId(request.getLocationId())
                .locationNote(request.getLocationNote())
                .scheduledStart(request.getScheduledStart())
                .scheduledEndAt(scheduledEndAt)
                .status(SessionStatus.SCHEDULED)
                .capacity(request.getCapacity())
                .feeType(request.getFeeType())
                .feeAmountVnd(feeAmountVnd)
                .autoApprove(autoApprove)
                .initialSlot(initialSlot)
                .build();

        Session saved = sessionRepository.save(session);

        List<SessionParticipant> seedParticipants = new ArrayList<>();
        if (groupId == null) {
            // Standalone only — a group-linked session's creator is already implicitly the
            // group's owner/admin, not auto-added as a participant.
            seedParticipants.add(SessionParticipant.builder()
                    .sessionId(saved.getId())
                    .userId(userId)
                    .status(ParticipantStatus.JOINED)
                    .build());
        }
        List<SessionOutboxEvent> inviteOutboxEvents = new ArrayList<>();
        if (request.getInviteeIds() != null) {
            request.getInviteeIds().stream()
                    .filter(inviteeId -> !inviteeId.equals(userId))
                    .distinct()
                    .forEach(inviteeId -> {
                        seedParticipants.add(SessionParticipant.builder()
                                .sessionId(saved.getId())
                                .userId(inviteeId)
                                .status(ParticipantStatus.INVITED)
                                .build());
                        inviteOutboxEvents.add(buildOutboxEvent("session.invitation.created",
                                SessionInvitationCreatedEvent.builder()
                                        .sessionId(saved.getId())
                                        .actorId(userId)
                                        .recipientUserId(inviteeId)
                                        .build()));
                    });
        }
        if (!seedParticipants.isEmpty()) {
            sessionParticipantRepository.saveAll(seedParticipants);
        }
        if (!inviteOutboxEvents.isEmpty()) {
            sessionOutboxEventRepository.saveAll(inviteOutboxEvents);
        }

        log.info("Created session {} (type={}, group={})", saved.getId(), saved.getSessionType(), saved.getGroupId());
        return toResponse(saved, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public SessionResponse getSession(Long sessionId, UUID callerId) {
        return toResponse(findSessionOrThrow(sessionId), callerId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getGroupSessions(Long groupId, UUID currentUserId, Pageable pageable) {
        // Enforces the existing private-group membership gate rather than reimplementing it.
        groupService.getGroup(groupId, currentUserId);
        return toResponsePage(sessionRepository.findByGroupId(groupId, pageable), currentUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getSessionsCreatedByUser(UUID userId, Pageable pageable) {
        return toResponsePage(sessionRepository.findByCreatedByAndGroupIdIsNull(userId, pageable), userId);
    }

    @Override
    @Transactional
    public SessionResponse updateSession(Long sessionId, UUID userId, UpdateSessionRequest request) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, userId);

        if (request.getTitle() != null) {
            session.setTitle(request.getTitle());
        }
        if (request.getDescription() != null) {
            session.setDescription(request.getDescription());
        }
        if (request.getLocationId() != null) {
            LocationResponse location = locationService.getLocation(request.getLocationId());
            if (!Objects.equals(location.getSportId(), session.getSportId())) {
                throw new BadRequestException("locationId does not match this session's sport");
            }
            session.setLocationId(request.getLocationId());
        }
        if (request.getLocationNote() != null) {
            session.setLocationNote(request.getLocationNote());
        }
        if (request.getScheduledStart() != null) {
            session.setScheduledStart(request.getScheduledStart());
        }
        if (request.getDurationMinutes() != null) {
            session.setScheduledEndAt(session.getScheduledStart().plusMinutes(request.getDurationMinutes()));
        }
        if (request.getCapacity() != null) {
            session.setCapacity(request.getCapacity());
        }
        if (request.getFeeType() != null) {
            session.setFeeType(request.getFeeType());
        }
        if (request.getFeeAmountVnd() != null) {
            session.setFeeAmountVnd(request.getFeeAmountVnd());
        }
        if (request.getAutoApprove() != null) {
            session.setAutoApprove(request.getAutoApprove());
        }
        if (request.getInitialSlot() != null) {
            session.setInitialSlot(request.getInitialSlot());
        }
        // Re-resolved unconditionally so the FIXED/feeAmountVnd invariant holds regardless of
        // which fee field (if either) this request touched — catches "switched to FIXED without
        // an amount" and clears a stale amount when switching away from FIXED.
        session.setFeeAmountVnd(resolveFeeAmountVnd(session.getFeeType(), session.getFeeAmountVnd()));

        return toResponse(sessionRepository.save(session), userId);
    }

    /** Enforces "feeAmountVnd is meaningful only when feeType is FIXED": returns candidateAmount
     * for FIXED (rejecting a null candidate), null for FREE/SPLIT regardless of what was passed. */
    private Long resolveFeeAmountVnd(FeeType feeType, Long candidateAmount) {
        if (feeType == FeeType.FIXED) {
            if (candidateAmount == null) {
                throw new BadRequestException("feeAmountVnd is required when feeType is FIXED");
            }
            return candidateAmount;
        }
        return null;
    }

    @Override
    @Transactional
    public SessionResponse cancelSession(Long sessionId, UUID userId, CancelSessionRequest request) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, userId);
        if (session.getStatus() == SessionStatus.COMPLETED || session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot cancel a session that is already " + session.getStatus());
        }

        session.setStatus(SessionStatus.CANCELLED);
        session.setCancelReason(request != null ? request.getReason() : null);
        session.setCancelledBy(userId);
        session.setCancelledAt(LocalDateTime.now());

        return toResponse(sessionRepository.save(session), userId);
    }

    @Override
    @Transactional
    public void joinSession(Long sessionId, UUID userId) {
        Session session = findSessionOrThrow(sessionId);
        if (session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot join a cancelled session");
        }
        if (session.getGroupId() != null && !groupService.isGroupMember(session.getGroupId(), userId)) {
            throw new BadRequestException("Only group members can join this session");
        }

        Optional<SessionParticipant> existingParticipant = sessionParticipantRepository
                .findBySessionIdAndUserId(sessionId, userId);
        // SESSION-15: read BEFORE falling back to the builder below — SessionParticipant.status
        // carries @Builder.Default = JOINED, so a brand-new (no prior row) participant built via
        // that fallback would otherwise misreport its own "previous" status as JOINED.
        ParticipantStatus previousStatus = existingParticipant.map(SessionParticipant::getStatus).orElse(null);
        SessionParticipant participant = existingParticipant
                .orElseGet(() -> SessionParticipant.builder()
                        .sessionId(sessionId)
                        .userId(userId)
                        .build());

        // An INVITED row (from CreateSessionRequest.inviteeIds) always resolves straight to
        // JOINED — the invitee's own call here IS their acceptance, no creator decision needed.
        // Everything else goes through the autoApprove gate. Re-resolved fresh on every call, so
        // re-clicking join while REQUESTED is a harmless no-op, and once a row leaves INVITED
        // (accepted or otherwise) a later leave-and-rejoin goes through the normal gate.
        ParticipantStatus targetStatus = participant.getStatus() == ParticipantStatus.INVITED
                || Boolean.TRUE.equals(session.getAutoApprove())
                ? ParticipantStatus.JOINED
                : ParticipantStatus.REQUESTED;
        participant.setStatus(targetStatus);
        sessionParticipantRepository.save(participant);

        // SESSION-15: only fire on a genuine state transition — an already-JOINED caller
        // re-invoking join never fires anything here, regardless of what targetStatus recomputes
        // to (see this method's own pre-existing gap noted in SESSION-15's doc: a JOINED caller
        // on a non-autoApprove session recomputes to REQUESTED above, since the ternary never
        // special-cased "already JOINED" — out of scope to fix here, but this guard keeps that
        // gap from also spamming the organizer with a spurious join-request notification).
        if (previousStatus != ParticipantStatus.JOINED) {
            if (targetStatus == ParticipantStatus.REQUESTED && previousStatus != ParticipantStatus.REQUESTED) {
                recordOutboxEvent("session.join_request.created", SessionJoinRequestCreatedEvent.builder()
                        .sessionId(sessionId)
                        .actorId(userId)
                        .recipientUserId(session.getCreatedBy())
                        .build());
            } else if (targetStatus == ParticipantStatus.JOINED) {
                recordOutboxEvent("session.participant.joined", SessionParticipantJoinedEvent.builder()
                        .sessionId(sessionId)
                        .actorId(userId)
                        .build());
            }
        }
    }

    @Override
    @Transactional
    public void leaveSession(Long sessionId, UUID userId) {
        // Also doubles as "decline" (INVITED) and "cancel my request" (REQUESTED) — SESSION-9.
        // Same LEFT target for all three; the client picks the button label from the caller's
        // current status, same as "Accept" already reusing this endpoint's sibling, joinSession.
        // SESSION-14: a standalone session's creator is auto-JOINED at creation (createSession)
        // and can't leave via this endpoint — cancelSession is their only way out. Scoped to
        // standalone only: a group-linked session's creator isn't auto-joined, and if they later
        // join like a normal member (joinSession never blocks the creator), they can leave like
        // one too — their real ownership lever there is group role, not this participant row.
        Session session = findSessionOrThrow(sessionId);
        if (session.getGroupId() == null && userId.equals(session.getCreatedBy())) {
            throw new BadRequestException("The creator cannot leave their own session — cancel it instead");
        }

        SessionParticipant participant = sessionParticipantRepository
                .findBySessionIdAndUserId(sessionId, userId)
                .filter(p -> p.getStatus() == ParticipantStatus.JOINED
                        || p.getStatus() == ParticipantStatus.INVITED
                        || p.getStatus() == ParticipantStatus.REQUESTED)
                .orElseThrow(() -> new BadRequestException("Not currently a participant in this session"));
        participant.setStatus(ParticipantStatus.LEFT);
        sessionParticipantRepository.save(participant);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionParticipantResponse> getSessionParticipants(
            Long sessionId, UUID callerId, ParticipantStatus status, Pageable pageable) {
        ParticipantStatus effectiveStatus = status != null ? status : ParticipantStatus.JOINED;
        if (effectiveStatus != ParticipantStatus.JOINED) {
            requireCanModify(findSessionOrThrow(sessionId), callerId);
        }

        Page<SessionParticipant> participants = sessionParticipantRepository
                .findBySessionIdAndStatus(sessionId, effectiveStatus, pageable);

        List<UUID> userIds = participants.getContent().stream()
                .map(SessionParticipant::getUserId)
                .distinct()
                .collect(Collectors.toList());
        Map<UUID, UserResponse> users = userIds.isEmpty() ? Collections.emptyMap() : userService.getUsersByIds(userIds);

        return participants.map(p -> {
            UserResponse user = users.get(p.getUserId());
            return SessionParticipantResponse.builder()
                    .id(p.getId())
                    .sessionId(p.getSessionId())
                    .userId(p.getUserId())
                    .userFullName(user != null ? user.getFullName() : null)
                    .userAvatarUrl(user != null ? user.getAvatarUrl() : null)
                    .status(p.getStatus())
                    .rejectReason(p.getRejectReason())
                    .createdAt(p.getCreatedAt())
                    .build();
        });
    }

    @Override
    @Transactional
    public void approveParticipant(Long sessionId, UUID callerId, UUID userId) {
        SessionParticipant participant = requireRequestedParticipant(sessionId, callerId, userId);
        participant.setStatus(ParticipantStatus.JOINED);
        sessionParticipantRepository.save(participant);

        // Two distinct recipients: the requester (their request was approved) and every other
        // currently-JOINED participant (a new member joined) — requireRequestedParticipant
        // guarantees this is always a REQUESTED->JOINED transition, unlike joinSession.
        recordOutboxEvent("session.join_request.approved", SessionJoinRequestApprovedEvent.builder()
                .sessionId(sessionId)
                .actorId(callerId)
                .recipientUserId(userId)
                .build());
        recordOutboxEvent("session.participant.joined", SessionParticipantJoinedEvent.builder()
                .sessionId(sessionId)
                .actorId(userId)
                .build());
    }

    @Override
    @Transactional
    public void rejectParticipant(Long sessionId, UUID callerId, UUID userId, RejectParticipantRequest request) {
        SessionParticipant participant = requireRequestedParticipant(sessionId, callerId, userId);
        String reason = request != null ? request.getReason() : null;
        participant.setStatus(ParticipantStatus.LEFT);
        participant.setRejectReason(reason);
        sessionParticipantRepository.save(participant);

        recordOutboxEvent("session.join_request.rejected", SessionJoinRequestRejectedEvent.builder()
                .sessionId(sessionId)
                .actorId(callerId)
                .recipientUserId(userId)
                .reason(reason)
                .build());
    }

    /** Shared gating + lookup for approveParticipant/rejectParticipant: same creator/owner-admin
     * gate as cancelSession/updateSession, rejects a CANCELLED session, and requires an existing
     * REQUESTED row (an INVITED row isn't approvable here — only the invitee's own joinSession
     * call resolves it). */
    private SessionParticipant requireRequestedParticipant(Long sessionId, UUID callerId, UUID userId) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, callerId);
        if (session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot approve or reject participants for a cancelled session");
        }
        return sessionParticipantRepository.findBySessionIdAndUserId(sessionId, userId)
                .filter(p -> p.getStatus() == ParticipantStatus.REQUESTED)
                .orElseThrow(() -> new BadRequestException("No pending join request for this user"));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> discoverSessions(UUID callerId, Long sportId, Pageable pageable) {
        List<Long> activeSportIds = userSportProfileService.getUserProfiles(callerId).stream()
                .map(UserSportProfileResponse::getSportId)
                .distinct()
                .collect(Collectors.toList());

        List<Long> effectiveSportIds = sportId != null
                ? (activeSportIds.contains(sportId) ? List.of(sportId) : List.of())
                : activeSportIds;

        if (effectiveSportIds.isEmpty()) {
            return Page.empty(pageable);
        }

        Page<Session> sessions = sessionRepository.findDiscoverSessions(
                SessionStatus.SCHEDULED, effectiveSportIds, callerId, ParticipantStatus.JOINED, pageable);
        return toResponsePage(sessions, callerId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getJoinedSessions(UUID userId, SessionStatus status, Pageable pageable) {
        Page<Session> sessions = status != null
                ? sessionRepository.findJoinedSessionsByStatus(status, userId, ParticipantStatus.JOINED, pageable)
                : sessionRepository.findJoinedSessions(userId, ParticipantStatus.JOINED, pageable);
        return toResponsePage(sessions, userId);
    }

    @Override
    @Transactional
    public CommentResponse createSessionComment(Long sessionId, UUID userId, CreateCommentRequest request) {
        Session session = requireSessionAccess(sessionId, userId);
        CommentResponse response = commentService.createSessionComment(session.getPostId(), userId, request);

        recordOutboxEvent("session.comment.created", SessionCommentCreatedEvent.builder()
                .sessionId(sessionId)
                .actorId(userId)
                .commentId(response.getId())
                .build());

        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<CommentResponse> getSessionComments(Long sessionId, UUID callerId, Pageable pageable) {
        Session session = requireSessionAccess(sessionId, callerId);
        return commentService.getSessionPostComments(session.getPostId(), callerId, pageable);
    }

    @Override
    @Transactional
    public void likeSessionComment(Long sessionId, Long commentId, UUID userId) {
        Session session = requireSessionAccess(sessionId, userId);
        commentService.likeSessionComment(session.getPostId(), commentId, userId);
    }

    @Override
    @Transactional
    public void unlikeSessionComment(Long sessionId, Long commentId, UUID userId) {
        Session session = requireSessionAccess(sessionId, userId);
        commentService.unlikeSessionComment(session.getPostId(), commentId, userId);
    }

    @Override
    @Transactional
    public void likeSession(Long sessionId, UUID userId) {
        Session session = requireSessionAccess(sessionId, userId);
        postService.likeSessionPost(session.getPostId(), userId);
    }

    @Override
    @Transactional
    public void unlikeSession(Long sessionId, UUID userId) {
        Session session = requireSessionAccess(sessionId, userId);
        postService.unlikeSessionPost(session.getPostId(), userId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> getParticipantIdsByStatuses(Long sessionId, List<ParticipantStatus> statuses) {
        Session session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null
                || (session.getStatus() != SessionStatus.SCHEDULED && session.getStatus() != SessionStatus.ONGOING)) {
            return Collections.emptyList();
        }
        return sessionParticipantRepository.findBySessionIdAndStatusIn(sessionId, statuses).stream()
                .map(SessionParticipant::getUserId)
                .distinct()
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, String> getSessionTitlesByIds(List<Long> sessionIds) {
        return sessionRepository.findAllById(sessionIds).stream()
                .collect(Collectors.toMap(Session::getId, Session::getTitle));
    }

    /** SESSION-10/A17 — the sole gate standing between a caller and a session's comment thread or
     * its own like, since post-impl's own PostGate makes SESSION_POST unconditionally unavailable.
     * Delegates to SessionGate (this module's own ResourceGate&lt;Session&gt;, same shape as
     * post-impl's PostGate) rather than reimplementing the two-question logic here. */
    private Session requireSessionAccess(Long sessionId, UUID callerId) {
        Session session = sessionRepository.findById(sessionId).orElse(null);
        return sessionGate.require(session, callerId,
                "Session not found", "You don't have access to this session");
    }

    private Session findSessionOrThrow(Long sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session", "id", sessionId));
    }

    /**
     * Writes one {@code session_outbox_events} row in the same transaction as the triggering
     * write (SESSION-15) — never a separate transaction, so a rollback of the caller's write also
     * rolls this back. {@code SessionOutboxRelayJob} is the only thing that ever reads a row back
     * out. A serialization failure here is a programmer error (the payload types are this class's
     * own event DTOs), so it's rethrown unchecked rather than swallowed.
     */
    private void recordOutboxEvent(String eventType, Object payload) {
        sessionOutboxEventRepository.save(buildOutboxEvent(eventType, payload));
    }

    /**
     * Builds without saving — lets {@link #createSession} collect one row per invitee and persist
     * them all via a single {@code saveAll}, same batching shape as this method's own
     * {@code seedParticipants} list, instead of one {@code save()} per invitee in that loop.
     */
    private SessionOutboxEvent buildOutboxEvent(String eventType, Object payload) {
        SessionOutboxEvent event = new SessionOutboxEvent();
        event.setEventType(eventType);
        try {
            event.setPayload(objectMapper.writeValueAsString(payload));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload for " + eventType, e);
        }
        return event;
    }

    private void requireCanModify(Session session, UUID userId) {
        if (session.getGroupId() == null) {
            if (!session.getCreatedBy().equals(userId)) {
                throw new BadRequestException("Only the creator can modify this session");
            }
        } else if (!groupService.canManageMembers(session.getGroupId(), userId)) {
            throw new BadRequestException("Only group owners and admins can modify this session");
        }
    }

    private SessionResponse toResponse(Session session, UUID callerId) {
        return mapToResponses(List.of(session), callerId).get(0);
    }

    private Page<SessionResponse> toResponsePage(Page<Session> sessions, UUID callerId) {
        List<SessionResponse> mapped = mapToResponses(sessions.getContent(), callerId);
        return new PageImpl<>(mapped, sessions.getPageable(), sessions.getTotalElements());
    }

    /**
     * Batch-resolves creator/sport/location/participant-count/caller's-own-participation/
     * SESSION_POST-like-info for a list of sessions in one round trip each — never per-row calls
     * in a loop, per the no-N+1 rule. callerId (SESSION-9) resolves each
     * SessionResponse.callerParticipation and (session-like heart button) whose posts callerId
     * has liked.
     */
    private List<SessionResponse> mapToResponses(List<Session> sessions, UUID callerId) {
        if (sessions.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> userIds = sessions.stream()
                .flatMap(s -> Stream.of(s.getCreatedBy(), s.getCancelledBy()))
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        List<Long> sportIds = sessions.stream().map(Session::getSportId).distinct().collect(Collectors.toList());
        List<Long> locationIds = sessions.stream().map(Session::getLocationId).distinct().collect(Collectors.toList());
        List<Long> sessionIds = sessions.stream().map(Session::getId).collect(Collectors.toList());
        List<Long> postIds = sessions.stream().map(Session::getPostId).distinct().collect(Collectors.toList());

        Map<UUID, UserResponse> users = userService.getUsersByIds(userIds);
        Map<Long, SportResponse> sports = sportIds.isEmpty() ? Collections.emptyMap() : sportService.getSportsByIds(sportIds);
        Map<Long, LocationResponse> locations = locationService.getLocationsByIds(locationIds);
        Map<Long, Long> participantCounts = sessionParticipantRepository
                .countBySessionIdsAndStatus(sessionIds, ParticipantStatus.JOINED).stream()
                .collect(Collectors.toMap(
                        SessionParticipantRepository.SessionParticipantCount::getSessionId,
                        SessionParticipantRepository.SessionParticipantCount::getCount));
        // Caller's own row per session, if any — not enriched with userFullName/userAvatarUrl
        // (it's always the caller's own identity, which they already know client-side).
        Map<Long, SessionParticipantResponse> callerParticipations = sessionParticipantRepository
                .findBySessionIdInAndUserId(sessionIds, callerId).stream()
                .collect(Collectors.toMap(SessionParticipant::getSessionId, p -> SessionParticipantResponse.builder()
                        .id(p.getId())
                        .sessionId(p.getSessionId())
                        .userId(p.getUserId())
                        .status(p.getStatus())
                        .rejectReason(p.getRejectReason())
                        .createdAt(p.getCreatedAt())
                        .build()));
        Map<Long, PostLikeInfoResponse> postLikeInfo = postService.getSessionPostLikeInfo(postIds, callerId);

        return sessions.stream()
                .map(session -> SessionResponse.builder()
                        .id(session.getId())
                        .postId(session.getPostId())
                        .groupId(session.getGroupId())
                        .sessionType(session.getSessionType())
                        .createdBy(session.getCreatedBy())
                        .createdByFullName(Optional.ofNullable(users.get(session.getCreatedBy()))
                                .map(UserResponse::getFullName).orElse(null))
                        .sportId(session.getSportId())
                        .sportName(Optional.ofNullable(session.getSportId())
                                .map(sports::get).map(SportResponse::getName).orElse(null))
                        .title(session.getTitle())
                        .description(session.getDescription())
                        .location(locations.get(session.getLocationId()))
                        .locationNote(session.getLocationNote())
                        .scheduledStart(session.getScheduledStart())
                        .scheduledEndAt(session.getScheduledEndAt())
                        .status(session.getStatus())
                        .cancelReason(session.getCancelReason())
                        .cancelledBy(session.getCancelledBy())
                        .cancelledByFullName(Optional.ofNullable(session.getCancelledBy())
                                .map(users::get).map(UserResponse::getFullName).orElse(null))
                        .cancelledAt(session.getCancelledAt())
                        // initialSlot (participants already accounted for outside the app) sits on
                        // top of the real JOINED count — not a raw participant-table count.
                        .participantCount(participantCounts.getOrDefault(session.getId(), 0L)
                                + session.getInitialSlot())
                        .capacity(session.getCapacity())
                        .feeType(session.getFeeType())
                        .feeAmountVnd(session.getFeeAmountVnd())
                        .autoApprove(session.getAutoApprove())
                        .initialSlot(session.getInitialSlot())
                        .callerParticipation(callerParticipations.get(session.getId()))
                        .likeCount(Optional.ofNullable(postLikeInfo.get(session.getPostId()))
                                .map(PostLikeInfoResponse::getLikeCount).orElse(0L))
                        .isLikedByCurrentUser(Optional.ofNullable(postLikeInfo.get(session.getPostId()))
                                .map(PostLikeInfoResponse::getIsLikedByCurrentUser).orElse(false))
                        .createdAt(session.getCreatedAt())
                        .updatedAt(session.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
