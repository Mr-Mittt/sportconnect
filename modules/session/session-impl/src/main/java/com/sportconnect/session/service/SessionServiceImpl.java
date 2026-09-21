package com.sportconnect.session.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.value.AttributeValueFilter;
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
import com.sportconnect.session.api.dto.SessionHistoryDateCount;
import com.sportconnect.session.api.dto.SessionHistoryDatesResponse;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.dto.StartTimeFilter;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.event.SessionCommentCreatedEvent;
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent;
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent;
import com.sportconnect.session.api.event.SessionParticipantLeftEvent;
import com.sportconnect.session.api.event.SessionUpdatedEvent;
import com.sportconnect.session.api.service.SessionService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.repository.SessionRepository.SessionDateCountProjection;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
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
    private final SessionOutboxWriter sessionOutboxWriter;
    private final ObjectMapper objectMapper;

    /** SESSION-23 — same serialized-size ceiling profile attributes use
     * ({@code UserSportProfileServiceImpl.MAX_ATTRIBUTES_BYTES}); checked against the filtered map. */
    private static final int MAX_ATTRIBUTES_BYTES = 4096;

    /** SESSION-27 — the session/participant-status populations getUpcomingSessions/
     * getSessionHistory(Dates) query against. Native-query variants need the enum names as
     * plain strings (no @Enumerated context to bind a Java enum directly). */
    private static final List<SessionStatus> UPCOMING_SESSION_STATUSES =
            List.of(SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING);
    private static final List<ParticipantStatus> UPCOMING_PARTICIPANT_STATUSES =
            List.of(ParticipantStatus.JOINED, ParticipantStatus.INVITED);
    private static final List<SessionStatus> HISTORY_SESSION_STATUSES =
            List.of(SessionStatus.CANCELLED, SessionStatus.COMPLETED);
    private static final List<String> HISTORY_SESSION_STATUS_NAMES =
            List.of(SessionStatus.CANCELLED.name(), SessionStatus.COMPLETED.name());

    /** SESSION-34/35 — the {@code viewerZoneId}-accepting methods' fallback zone when the caller
     * omits it (every caller today, until CLIENT-SESSION-24 ships). */
    private static final String DEFAULT_ZONE_ID = "UTC";

    /** SESSION-25 — discoverSessions' default status list when the caller omits/empties
     * {@code statuses}, or when an explicit list is left empty after {@link #resolveDiscoverStatuses}
     * strips {@code ONGOING} out of it (SESSION-37). No longer coincides with
     * {@link #UPCOMING_SESSION_STATUSES} as of SESSION-37 — discover's default dropped
     * {@code ONGOING}, upcoming's inclusion set didn't. */
    private static final List<SessionStatus> DISCOVER_DEFAULT_STATUSES =
            List.of(SessionStatus.PREPARING, SessionStatus.SCHEDULED);

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

        // A7: reject a caller-supplied sportId naming a deactivated sport. Gated on the request
        // field being non-null rather than on the standalone/group branch, because the group
        // branch also honours request.getSportId() when present and only falls back to the
        // group's own sportId when it is absent - branching on sessionType would let a
        // caller-supplied inactive sport through on a group session. The inherited
        // group.getSportId() case needs no check here: GroupServiceImpl.createGroup now rejects
        // inactive sports, so no new group can carry one. A group created before A7 against a
        // since-deactivated sport is pre-existing data and keeps working, same read-path policy
        // as A6.
        if (request.getSportId() != null) {
            sportService.requireActiveSportById(sportId);
        }

        // SESSION-24: locationId is now optional — a session missing it (or feeType) starts
        // PREPARING instead of SCHEDULED, so the sport-match check only applies once a location
        // is actually supplied.
        if (request.getLocationId() != null) {
            LocationResponse location = locationService.getLocation(request.getLocationId());
            if (!Objects.equals(location.getSportId(), sportId)) {
                throw new BadRequestException("locationId does not match this session's sport");
            }
        }
        SessionStatus initialStatus = (request.getLocationId() != null && request.getFeeType() != null)
                ? SessionStatus.SCHEDULED
                : SessionStatus.PREPARING;

        Instant scheduledEndAt = request.getDurationMinutes() != null
                ? request.getScheduledStart().plus(Duration.ofMinutes(request.getDurationMinutes()))
                : null;

        Long feeAmountVnd = resolveFeeAmountVnd(request.getFeeType(), request.getFeeAmountVnd());
        boolean autoApprove = Boolean.TRUE.equals(request.getAutoApprove());
        int initialSlot = request.getInitialSlot() != null ? request.getInitialSlot() : 0;
        // SESSION-23: filter the submitted attributes against the sport's session schema (replace
        // semantics — the filtered map is the whole stored value). Null when none were supplied,
        // which also short-circuits the schema fetch for a session whose sport carries no schema.
        Map<String, Object> attributes = resolveAttributes(request.getAttributes(), sportId);

        // SESSION-10/A17: the companion SESSION_POST is created first, inline in this same
        // @Transactional method, so a failure here rolls back the whole session creation instead
        // of leaving a session with no comment-thread anchor. post-impl never sees a sessionId —
        // it hands back the new post's id, which becomes this session's own postId.
        Long postId = postService.createSessionPost(userId, "Session: " + request.getTitle());

        Session session = Session.builder()
                .groupId(groupId)
                .isPublic(groupId == null)
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
                .status(initialStatus)
                .capacity(request.getCapacity())
                .feeType(request.getFeeType())
                .feeAmountVnd(feeAmountVnd)
                .autoApprove(autoApprove)
                .initialSlot(initialSlot)
                .attributes(attributes)
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
                        inviteOutboxEvents.add(sessionOutboxWriter.build("session.invitation.created",
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

    /**
     * SESSION-35: {@code date}'s day boundary is computed in {@code viewerZoneId} (falling back to
     * {@link #DEFAULT_ZONE_ID} when omitted, via {@link #resolveZone}) rather than the JVM's own
     * zone — a caller-relative "today" the same way {@code discoverSessions}'/
     * {@code getSessionHistory}'s {@code date} filters are. No-op when {@code date} is null, since
     * {@code findUpcomingSessions} (the no-date branch) has no day boundary to compute at all.
     *
     * @throws BadRequestException if {@code viewerZoneId} is non-null but not a valid IANA zone id
     */
    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getUpcomingSessions(
            UUID userId, LocalDate date, String viewerZoneId, Pageable pageable) {
        Pageable effectivePageable = unsorted(pageable);
        Page<Session> sessions;
        if (date != null) {
            ZoneId zone = resolveZone(viewerZoneId);
            sessions = sessionRepository.findUpcomingSessionsByDate(UPCOMING_SESSION_STATUSES, userId,
                    UPCOMING_PARTICIPANT_STATUSES, SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                    date.atStartOfDay(zone).toInstant(),
                    date.plusDays(1).atStartOfDay(zone).toInstant(), effectivePageable);
        } else {
            sessions = sessionRepository.findUpcomingSessions(UPCOMING_SESSION_STATUSES, userId,
                    UPCOMING_PARTICIPANT_STATUSES, SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                    effectivePageable);
        }
        return toResponsePage(sessions, userId);
    }

    /**
     * SESSION-35: {@code date}'s day boundary is computed in {@code viewerZoneId} (falling back to
     * {@link #DEFAULT_ZONE_ID} when omitted, via {@link #resolveZone}) rather than the JVM's own
     * zone — same caller-relative treatment as {@code discoverSessions}'/
     * {@code getUpcomingSessions}'s {@code date} filters.
     *
     * @throws BadRequestException if {@code viewerZoneId} is non-null but not a valid IANA zone id
     */
    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getSessionHistory(
            UUID userId, LocalDate date, String viewerZoneId, Pageable pageable) {
        ZoneId zone = resolveZone(viewerZoneId);
        Instant dayStart = date.atStartOfDay(zone).toInstant();
        Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();
        Page<Session> sessions = sessionRepository.findHistorySessionsByDate(
                HISTORY_SESSION_STATUSES, userId, ParticipantStatus.JOINED, dayStart, dayEnd, unsorted(pageable));
        return toResponsePage(sessions, userId);
    }

    /**
     * SESSION-34/35 — resolves the caller-supplied {@code viewerZoneId} query param shared by
     * every zone-aware listing method ({@code discoverSessions}, {@code getSessionHistory},
     * {@code getUpcomingSessions}, {@code getSessionHistoryDates}): {@code null} falls back to
     * {@link #DEFAULT_ZONE_ID} rather than failing the request (every caller omits it today, until
     * CLIENT-SESSION-24 ships); a non-null value is validated via {@link ZoneId#of}.
     *
     * @throws BadRequestException if {@code viewerZoneId} is non-null but not a valid IANA zone id
     */
    private ZoneId resolveZone(String viewerZoneId) {
        if (viewerZoneId == null) {
            return ZoneId.of(DEFAULT_ZONE_ID);
        }
        try {
            return ZoneId.of(viewerZoneId);
        } catch (DateTimeException e) {
            throw new BadRequestException("viewerZoneId is not a valid IANA zone id: " + viewerZoneId);
        }
    }

    /**
     * SESSION-27/34. Fetches one extra row so {@code hasMore} can be computed without a separate
     * count query. Dates are bucketed by {@code viewerZoneId} — the viewer's own <em>current</em>
     * zone, not the session's location/origin zone — since a personal history reads oddest when a
     * date is pinned to somewhere the viewer no longer is (a completed session can even appear "in
     * the future" relative to the viewer's own current clock, if the viewer has since moved to a
     * very different zone). Falls back to {@link #DEFAULT_ZONE_ID} when {@code viewerZoneId}
     * is omitted (every caller today, until CLIENT-SESSION-24 ships) rather than failing the
     * request outright.
     *
     * @throws BadRequestException if {@code viewerZoneId} is non-null but not a valid IANA zone id
     */
    @Override
    @Transactional(readOnly = true)
    public SessionHistoryDatesResponse getSessionHistoryDates(
            UUID userId, int dateCount, LocalDate before, String viewerZoneId) {
        String zoneId = resolveZone(viewerZoneId).getId();
        List<SessionDateCountProjection> rows = sessionRepository.findHistoryDateCounts(
                HISTORY_SESSION_STATUS_NAMES, userId, ParticipantStatus.JOINED.name(), before, zoneId,
                dateCount + 1);
        boolean hasMore = rows.size() > dateCount;
        List<SessionHistoryDateCount> dates = rows.stream()
                .limit(dateCount)
                .map(row -> SessionHistoryDateCount.builder()
                        .date(row.getSessionDate())
                        .count(row.getCount())
                        .build())
                .collect(Collectors.toList());
        return SessionHistoryDatesResponse.builder().dates(dates).hasMore(hasMore).build();
    }

    /** SESSION-27 — strips any client-supplied {@code Sort} down to just {@code page}/{@code size}.
     * {@code getUpcomingSessions}/{@code getSessionHistory}'s ordering is a static, non-negotiable
     * part of the query (see {@code SessionRepository.findUpcomingSessions}'s Javadoc) — this ticket
     * exists specifically because the old {@code /mine} endpoint's implicit, unrequested ordering
     * silently dropped sessions past page 0, so the fix does not leave the order caller-overridable
     * either. */
    private Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }

    @Override
    @Transactional
    public SessionResponse updateSession(Long sessionId, UUID userId, UpdateSessionRequest request) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, userId);

        // SESSION-24: locationId/feeType are only changeable while the session is PREPARING —
        // once genuinely SCHEDULED (or beyond), they're immutable via this endpoint. Checked
        // before applying any field so a rejected request leaves the session fully untouched.
        if ((request.getLocationId() != null || request.getFeeType() != null)
                && session.getStatus() != SessionStatus.PREPARING) {
            throw new BadRequestException("locationId/feeType can only be changed while the session is PREPARING");
        }

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
            session.setScheduledEndAt(session.getScheduledStart().plus(Duration.ofMinutes(request.getDurationMinutes())));
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
        // SESSION-23: replace semantics — a non-null map is filtered and stored wholesale; a null
        // (or omitted) map leaves the stored attributes untouched, so a plain title/time edit
        // never fetches the schema (and so never 404s on a since-deactivated sport). An explicit
        // empty map filters to empty and clears them.
        if (request.getAttributes() != null) {
            session.setAttributes(resolveAttributes(request.getAttributes(), session.getSportId()));
        }
        // Re-resolved unconditionally so the FIXED/feeAmountVnd invariant holds regardless of
        // which fee field (if either) this request touched — catches "switched to FIXED without
        // an amount" and clears a stale amount when switching away from FIXED.
        session.setFeeAmountVnd(resolveFeeAmountVnd(session.getFeeType(), session.getFeeAmountVnd()));

        // SESSION-24: PREPARING -> SCHEDULED once both location and fee type are present.
        if (session.getStatus() == SessionStatus.PREPARING
                && session.getLocationId() != null && session.getFeeType() != null) {
            session.setStatus(SessionStatus.SCHEDULED);
        }

        Session saved = sessionRepository.save(session);

        // SESSION-24: field-agnostic — fires on every successful update, fanned out to the
        // session's currently-JOINED participants (actor excluded at consume time).
        sessionOutboxWriter.record("session.details.updated", SessionUpdatedEvent.builder()
                .sessionId(saved.getId())
                .actorId(userId)
                .build());

        return toResponse(saved, userId);
    }

    /**
     * SESSION-23 — turns a caller-supplied session attribute map into the map to persist.
     *
     * <p>Flow: {@code null} request → {@code null} (nothing supplied; the caller stores that as-is,
     * and the sport's session schema is never fetched). Otherwise fetch the sport's
     * {@code #ref}-expanded session schema via {@link SportService#getSessionAttributeSchemaRaw},
     * run the submitted map through common {@link AttributeValueFilter} (unknown / wrong-typed /
     * switched-off entries dropped silently), then enforce the 4KB serialized cap on what survives.
     *
     * <p><b>Deactivated sport:</b> {@code getSessionAttributeSchemaRaw} is active-only and throws
     * {@code ResourceNotFoundException} for an inactive sport. That propagates here by design — a
     * caller only reaches this method by actively supplying attributes, and submitting structured
     * attributes against a dead sport's schema has no meaning, the same stance {@code createSession}
     * already takes on a caller-supplied inactive {@code sportId}. A create/update that supplies no
     * attributes never calls this and is unaffected.
     *
     * @return the filtered map to store (possibly empty — an explicit clear), or {@code null} when
     *         nothing was supplied
     */
    private Map<String, Object> resolveAttributes(Map<String, Object> requested, Long sportId) {
        if (requested == null) {
            return null;
        }
        AttributeSchema schema = sportService.getSessionAttributeSchemaRaw(sportId);
        Map<String, Object> filtered = AttributeValueFilter.filter(requested, schema);
        validateAttributesSize(filtered);
        return filtered;
    }

    /** Rejects a session-attributes map whose JSON serialization exceeds {@link #MAX_ATTRIBUTES_BYTES};
     * mirrors {@code UserSportProfileServiceImpl.validateAttributesSize}. Checked against the already
     * filtered map, so an oversized payload that is mostly junk still fails rather than being
     * silently trimmed to fit. */
    private void validateAttributesSize(Map<String, Object> attributes) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(attributes);
            if (json.length > MAX_ATTRIBUTES_BYTES) {
                throw new BadRequestException("Session attributes exceed the maximum allowed size (4KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid session attributes");
        }
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

        // SESSION-16: an already-JOINED caller re-invoking join is a no-op — without this, the
        // ternary below never special-cased "already JOINED" and would demote them back to
        // REQUESTED on a non-autoApprove session.
        if (previousStatus == ParticipantStatus.JOINED) {
            return;
        }

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

        // SESSION-15: only fire on a genuine state transition. previousStatus is guaranteed not
        // JOINED here (SESSION-16's early return above catches that case), so no extra guard is
        // needed to avoid double-firing on an already-JOINED caller.
        if (targetStatus == ParticipantStatus.REQUESTED && previousStatus != ParticipantStatus.REQUESTED) {
            sessionOutboxWriter.record("session.join_request.created", SessionJoinRequestCreatedEvent.builder()
                    .sessionId(sessionId)
                    .actorId(userId)
                    .recipientUserId(session.getCreatedBy())
                    .build());
        } else if (targetStatus == ParticipantStatus.JOINED) {
            sessionOutboxWriter.record("session.participant.joined", SessionParticipantJoinedEvent.builder()
                    .sessionId(sessionId)
                    .actorId(userId)
                    .build());
            writeSystemComment(session, resolveParticipantName(userId) + " joined the session");
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
        // SESSION-19: read BEFORE the flip below — the row is mutated in place, so after
        // setStatus(LEFT) there is no way left to tell which of the three allowed source states
        // this leave actually came from.
        ParticipantStatus previousStatus = participant.getStatus();
        participant.setStatus(ParticipantStatus.LEFT);
        sessionParticipantRepository.save(participant);

        // SESSION-19: only a genuine JOINED -> LEFT notifies. The INVITED -> LEFT (declining an
        // invite) and REQUESTED -> LEFT (cancelling a join request) transitions this same method
        // also serves deliberately notify nobody — no one was ever counting on a person who had
        // not actually joined.
        if (previousStatus == ParticipantStatus.JOINED) {
            sessionOutboxWriter.record("session.participant.left", SessionParticipantLeftEvent.builder()
                    .sessionId(sessionId)
                    .actorId(userId)
                    .build());
            writeSystemComment(session, resolveParticipantName(userId) + " left the session");
        }
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
        Session session = findSessionOrThrow(sessionId);
        SessionParticipant participant = requireRequestedParticipant(session, callerId, userId);
        participant.setStatus(ParticipantStatus.JOINED);
        sessionParticipantRepository.save(participant);

        // Two distinct recipients: the requester (their request was approved) and every other
        // currently-JOINED participant (a new member joined) — requireRequestedParticipant
        // guarantees this is always a REQUESTED->JOINED transition, unlike joinSession.
        sessionOutboxWriter.record("session.join_request.approved", SessionJoinRequestApprovedEvent.builder()
                .sessionId(sessionId)
                .actorId(callerId)
                .recipientUserId(userId)
                .build());
        sessionOutboxWriter.record("session.participant.joined", SessionParticipantJoinedEvent.builder()
                .sessionId(sessionId)
                .actorId(userId)
                .build());
        writeSystemComment(session, resolveParticipantName(userId) + " joined the session");
    }

    @Override
    @Transactional
    public void rejectParticipant(Long sessionId, UUID callerId, UUID userId, RejectParticipantRequest request) {
        SessionParticipant participant = requireRequestedParticipant(findSessionOrThrow(sessionId), callerId, userId);
        String reason = request != null ? request.getReason() : null;
        participant.setStatus(ParticipantStatus.LEFT);
        participant.setRejectReason(reason);
        sessionParticipantRepository.save(participant);

        sessionOutboxWriter.record("session.join_request.rejected", SessionJoinRequestRejectedEvent.builder()
                .sessionId(sessionId)
                .actorId(callerId)
                .recipientUserId(userId)
                .reason(reason)
                .build());
    }

    /** Shared gating + lookup for approveParticipant/rejectParticipant: same creator/owner-admin
     * gate as cancelSession/updateSession, rejects a CANCELLED session, and requires an existing
     * REQUESTED row (an INVITED row isn't approvable here — only the invitee's own joinSession
     * call resolves it). Takes the already-resolved {@code Session} rather than an id (SESSION-21)
     * so {@code approveParticipant}, which needs it for the system comment, doesn't fetch it
     * twice. */
    private SessionParticipant requireRequestedParticipant(Session session, UUID callerId, UUID userId) {
        Long sessionId = session.getId();
        requireCanModify(session, callerId);
        if (session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot approve or reject participants for a cancelled session");
        }
        return sessionParticipantRepository.findBySessionIdAndUserId(sessionId, userId)
                .filter(p -> p.getStatus() == ParticipantStatus.REQUESTED)
                .orElseThrow(() -> new BadRequestException("No pending join request for this user"));
    }

    /**
     * SESSION-35: {@code date}'s day boundary and {@code startTime}'s time-of-day comparison are
     * both evaluated in {@code viewerZoneId} (falling back to {@link #DEFAULT_ZONE_ID} when
     * omitted, via {@link #resolveZone}) — a "sessions starting before 9am" filter is inherently
     * caller-relative, not server-relative. Replaces the previous JVM-zone placeholder
     * ({@code date}) and the JVM-offset {@code zoneOffsetSeconds}/{@code MOD} correction
     * ({@code startTime}) with the same correction computed from the caller's own zone instead —
     * see {@code SessionRepository.findDiscoverSessions}' Javadoc for exactly what this does and
     * does not fix (correct unconditionally for a non-DST zone; a known, accepted residual gap for
     * a DST-observing zone when a candidate session's date sits in the other DST season than the
     * moment of the request — a real per-row fix was evaluated and rejected as too large a rewrite
     * for this ticket, see that Javadoc).
     *
     * <p><b>SESSION-37 final decision — supersedes SESSION-35's exact-day match:</b>
     * {@code date} is still required, but its resolved time range is no longer a plain
     * {@code [dayStart, dayEnd)} exact-day window:
     * <ul>
     *   <li>{@code date < today} (in {@code viewerZoneId}) — silently clamped to today's own
     *       semantics below, never a 400 and never simply ignored.</li>
     *   <li>{@code date == today} — {@code [now(), dayEnd(today))}, excluding sessions that
     *       already started earlier today.</li>
     *   <li>{@code date > today} — {@code [dayStart(date), dayEnd(date))}, unchanged from
     *       SESSION-35.</li>
     * </ul>
     * {@code status}'s default also drops {@code ONGOING} (now {@code {PREPARING, SCHEDULED}});
     * an explicit list containing {@code ONGOING} has it silently stripped rather than rejected,
     * falling back to the default if stripping empties the list. {@code startTimeFilter}/
     * {@code startTime} are no longer a strict pair (the controller's old "must be given together"
     * 400 is gone): {@code startTime} alone defaults its filter direction to
     * {@code AFTER_OR_EQUAL}; {@code startTimeFilter} alone is silently ignored (already the
     * existing behavior below, since both {@code startTimeBeforeOrEqual}/
     * {@code startTimeAfterOrEqual} require a non-null {@code startTime} to ever populate).
     *
     * @throws BadRequestException if {@code viewerZoneId} is non-null but not a valid IANA zone id
     */
    /** SESSION-37 — {@code ONGOING} is no longer part of {@code /discover}'s default status list,
     * but an explicit list naming it isn't a 400 either (unlike a genuinely invalid value, which
     * the controller still rejects before this method ever runs) — it's silently stripped instead.
     * A null/empty {@code statuses} uses the default directly; stripping {@code ONGOING} out of a
     * non-empty explicit list falls back to the default only if that empties the list entirely. */
    private List<SessionStatus> resolveDiscoverStatuses(List<SessionStatus> statuses) {
        if (statuses == null || statuses.isEmpty()) {
            return DISCOVER_DEFAULT_STATUSES;
        }
        List<SessionStatus> stripped = statuses.stream()
                .filter(status -> status != SessionStatus.ONGOING)
                .distinct()
                .collect(Collectors.toList());
        return stripped.isEmpty() ? DISCOVER_DEFAULT_STATUSES : stripped;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> discoverSessions(
            UUID callerId, Long sportId, String title, Long locationId, Integer minOpenSlots,
            FeeType feeType, Long maxFeeAmountVnd, LocalDate date,
            StartTimeFilter startTimeFilter, LocalTime startTime, String viewerZoneId,
            List<SessionStatus> statuses, Pageable pageable) {
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

        List<SessionStatus> effectiveStatuses = resolveDiscoverStatuses(statuses);
        ZoneId zone = resolveZone(viewerZoneId);
        // SESSION-37: date < today clamps to today; date == today floors at now() instead of
        // today's own dayStart (excludes sessions that already started); date > today is the
        // plain [dayStart, dayEnd) window SESSION-35 shipped. Still a plain instant comparison —
        // no query-side change needed, unlike startTime below (see
        // SessionRepository.findDiscoverSessions' Javadoc for why the two differ: date is a
        // caller-known range, startTime is a per-row time-of-day extraction).
        LocalDate today = LocalDate.now(zone);
        LocalDate effectiveDate = date.isBefore(today) ? today : date;
        Instant dayEnd = effectiveDate.plusDays(1).atStartOfDay(zone).toInstant();
        Instant dayStart = effectiveDate.equals(today)
                ? Instant.now()
                : effectiveDate.atStartOfDay(zone).toInstant();
        // SESSION-37: startTimeFilter/startTime are no longer a strict pair. startTime given alone
        // defaults the direction to AFTER_OR_EQUAL; startTimeFilter given alone already falls
        // through as a no-op below (both startTimeBeforeOrEqual/startTimeAfterOrEqual require a
        // non-null startTime to ever populate).
        StartTimeFilter effectiveStartTimeFilter = (startTimeFilter == null && startTime != null)
                ? StartTimeFilter.AFTER_OR_EQUAL : startTimeFilter;
        // Unconverted wall-clock seconds-of-day — the repository query reconstructs the
        // wall-clock-equivalent from scheduledStart's raw stored representation itself (MOD
        // arithmetic against zoneOffsetSeconds), rather than shifting this parameter. See
        // SessionRepository.findDiscoverSessions' Javadoc: shifting the parameter instead breaks
        // the "any date" cyclic comparison whenever it crosses the wrap point the shift
        // introduces (confirmed: AFTER_OR_EQUAL 00:00 inverted against an 18:00 session).
        Integer startTimeBeforeOrEqual = effectiveStartTimeFilter == StartTimeFilter.BEFORE_OR_EQUAL && startTime != null
                ? startTime.toSecondOfDay() : null;
        Integer startTimeAfterOrEqual = effectiveStartTimeFilter == StartTimeFilter.AFTER_OR_EQUAL && startTime != null
                ? startTime.toSecondOfDay() : null;
        // The caller's zone's current UTC offset in seconds (SESSION-35: resolveZone(viewerZoneId),
        // not the JVM's own zone) — added back to scheduledStart's raw-stored EXTRACT to reconstruct
        // the caller's wall-clock time-of-day. Only ever used by the two startTime* clauses, so left
        // null (no-op MOD) when neither is set. Computed from "now", not each row's own date — see
        // SessionRepository.findDiscoverSessions' Javadoc for the accepted DST-across-seasons gap
        // this implies for a DST-observing viewerZoneId.
        Integer zoneOffsetSeconds = (startTimeBeforeOrEqual != null || startTimeAfterOrEqual != null)
                ? zone.getRules().getOffset(Instant.now()).getTotalSeconds()
                : null;

        Page<Object[]> rows = sessionRepository.findDiscoverSessions(
                effectiveStatuses, effectiveSportIds, callerId, ParticipantStatus.JOINED, null,
                title, locationId, feeType, maxFeeAmountVnd, dayStart, dayEnd,
                startTimeBeforeOrEqual, startTimeAfterOrEqual, zoneOffsetSeconds, minOpenSlots, unsorted(pageable));
        Page<Session> sessions = rows.map(row -> (Session) row[0]);
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

        sessionOutboxWriter.record("session.comment.created", SessionCommentCreatedEvent.builder()
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
    public List<UUID> getParticipantIdsByStatuses(Long sessionId,
                                                  List<ParticipantStatus> participantStatuses,
                                                  List<SessionStatus> allowedSessionStatuses) {
        Session session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null || !allowedSessionStatuses.contains(session.getStatus())) {
            return Collections.emptyList();
        }
        return sessionParticipantRepository.findBySessionIdAndStatusIn(sessionId, participantStatuses).stream()
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
     * SESSION-21 — writes one system entry into this session's discussion thread (the companion
     * {@code SESSION_POST}'s comment list), for the three moments that already emit an outbox
     * event: a participant joined, a participant left, and the session started.
     *
     * <p>Authored by the session's own {@code createdBy}, never the participant the entry is
     * <em>about</em>. A system comment has no real author, and this codebase resolves that by
     * putting a real user in the NOT NULL column and letting a type discriminator carry the
     * "this is a system entry" signal — B9's {@code GROUP_SYSTEM} precedent, where the group's
     * owner authors a welcome post about someone else — rather than making the column nullable.
     *
     * <p><b>Deliberately does not emit {@code session.comment.created}.</b> All three trigger
     * points already notify through their own event ({@code participant.joined}/{@code .left},
     * {@code status.started}); firing a comment notification too would ping every participant
     * twice for one occurrence. This is a confirmed product decision, not an oversight — see
     * {@code modules/session/docs/MVP/SESSION-21_SYSTEM_COMMENTS_IN_SESSION_THREAD.md}.
     */
    private void writeSystemComment(Session session, String content) {
        commentService.createSystemSessionComment(session.getPostId(), session.getCreatedBy(), content);
    }

    /**
     * Resolves a participant's display name for a system comment's server-templated content, via
     * the same batch cross-domain call the response mappers use. Falls back to a neutral label
     * rather than throwing, so an unresolvable user can never fail an otherwise valid join/leave.
     * The name is baked in at write time (same as {@code GroupServiceImpl.postWelcomeMessage}), so
     * a later rename won't rewrite history in the thread.
     */
    private String resolveParticipantName(UUID userId) {
        UserResponse user = userService.getUsersByIds(List.of(userId)).get(userId);
        return user != null ? user.getFullName() : "A participant";
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
        // SESSION-24: locationId is nullable (a PREPARING session may not have one yet) — filtered
        // before the batch lookup, same as userIds above, since a null id has no meaning to pass on.
        List<Long> locationIds = sessions.stream().map(Session::getLocationId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList());
        List<Long> sessionIds = sessions.stream().map(Session::getId).collect(Collectors.toList());
        List<Long> postIds = sessions.stream().map(Session::getPostId).distinct().collect(Collectors.toList());

        Map<UUID, UserResponse> users = userService.getUsersByIds(userIds);
        Map<Long, SportResponse> sports = sportIds.isEmpty() ? Collections.emptyMap() : sportService.getActiveSportsByIds(sportIds);
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
                        // SESSION-23 — column on the already-loaded entity; no extra query, no N+1.
                        .attributes(session.getAttributes())
                        .createdAt(session.getCreatedAt())
                        .updatedAt(session.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
