package com.sportconnect.session.service;

import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.event.SessionStatusStartedEvent;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.SystemSessionCommentRequest;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.api.service.PostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Internal only — not exposed via {@code session-api}; its callers are
 * {@link com.sportconnect.session.job.SessionGenerationJob} (the three remaining 15-minute jobs)
 * and {@link SessionServiceImpl} (the SESSION-38 event-driven generation triggers, via
 * {@link #generateForConfigs}) in this same module. Always maintains exactly the single next
 * occurrence per group (not a multi-week window) — extending that later is a small additive
 * change, deliberately not built now.
 *
 * <p><b>SESSION-38:</b> the old {@code generateUpcomingSessions()} — an hourly job that re-scanned
 * every group with auto-generate enabled, regardless of whether that group's next occurrence was
 * already generated — is removed. Generation is now triggered directly: {@link #closePastSessions}
 * below, when a {@code GROUP_RECURRING} session in its batch completes, and
 * {@code SessionServiceImpl.generateNextOccurrenceForGroup}, called by {@code group-impl} right
 * after a recurrence/settings save that might have just made a group eligible. Both funnel into
 * {@link #generateForConfigs}, the shared per-config generation logic this method used to run
 * inline over "every enabled group" — now run over whichever specific configs each trigger
 * resolved instead.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionGenerationService {

    private static final int START_BATCH_SIZE = 200;
    private static final int CLOSE_BATCH_SIZE = 200;
    private static final int CANCEL_UNPREPARED_BATCH_SIZE = 200;
    private static final String UNPREPARED_CANCEL_REASON =
            "Auto-cancelled — session setup was not completed before the scheduled start time";

    private final SessionRepository sessionRepository;
    private final GroupService groupService;
    private final LocationService locationService;
    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final SessionOutboxWriter sessionOutboxWriter;
    private final CommentService commentService;
    private final PostService postService;

    /**
     * SESSION-38 — the shared per-config generation logic, extracted from the old
     * {@code generateUpcomingSessions()} sweep so both event-driven triggers (session completion,
     * recurrence/settings-change) can reuse the exact same eligibility checks and idempotency
     * backstop instead of duplicating them. Callers are responsible for resolving which configs to
     * pass — this method itself does no group lookup.
     *
     * <p><b>{@code REQUIRES_NEW}, not the default {@code REQUIRED}:</b> both callers
     * ({@code closePastSessions} and {@code SessionServiceImpl.generateNextOccurrenceForGroup})
     * are themselves {@code @Transactional} and may already be nested inside a caller's own
     * transaction (an owner's {@code updateGroupRecurrence}/{@code updateGroupSettings} request).
     * A caught exception inside a <em>participating</em> transaction still marks the whole physical
     * transaction rollback-only in Spring — the existing-below {@code catch
     * (DataIntegrityViolationException)} block only stops the exception from propagating in Java,
     * it does <b>not</b> undo that marking, so the caller's own unrelated work would fail with
     * {@code UnexpectedRollbackException} at its own commit despite this method "succeeding".
     * {@code REQUIRES_NEW} gives this method its own physical transaction, suspending whatever the
     * caller was in — a failure here (caught or not) can only roll back this method's own
     * generation attempt, never the caller's enclosing work. Found and fixed while building
     * SESSION-38's own IT coverage, the first real (non-mocked) exercise of this exact interaction.
     *
     * <p>SESSION-33: {@code computeNextOccurrence} returns a wall-clock value with no zone attached
     * — every auto-generated session has a real {@code recurrenceLocationId} ({@link
     * #hasCompleteRecurrenceRule} requires it), so that location's own timezone is the correct zone
     * to interpret it in. Falls back to the JVM's zone only when the location itself has no
     * timezone (LOC-4: best-effort, nullable). Locations are batch-resolved once across the whole
     * {@code configs} list — never one lookup per config — per CLAUDE.md's no-N+1 rule.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void generateForConfigs(List<GroupRecurrenceConfigResponse> configs) {
        List<Long> locationIds = configs.stream()
                .map(GroupRecurrenceConfigResponse::getRecurrenceLocationId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, LocationResponse> locationsById = locationService.getLocationsByIds(locationIds);

        for (GroupRecurrenceConfigResponse config : configs) {
            if (!hasCompleteRecurrenceRule(config)) {
                log.debug("Skipping group {} — incomplete recurrence rule", config.getGroupId());
                continue;
            }

            LocalDateTime nextOccurrenceLocal = computeNextOccurrence(config.getRecurrenceDayOfWeek(), config.getRecurrenceTime());
            ZoneId zone = resolveZone(locationsById.get(config.getRecurrenceLocationId()));
            Instant nextOccurrence = nextOccurrenceLocal.atZone(zone).toInstant();

            if (sessionRepository.existsByGroupIdAndScheduledStart(config.getGroupId(), nextOccurrence)) {
                continue;
            }

            Instant scheduledEndAt = config.getRecurrenceDurationMinutes() != null
                    ? nextOccurrence.plusSeconds(config.getRecurrenceDurationMinutes() * 60L)
                    : null;

            // SESSION-10/A17: every Session needs a companion SESSION_POST (post_id is NOT NULL,
            // unique — V051). This auto-generation path never created one, so every insert below
            // has actually been failing with a NOT NULL violation since V051 shipped — masked as a
            // "benign race" by the catch block below, which doesn't distinguish a real constraint
            // violation from a genuine duplicate-key race. Found and fixed while building
            // SESSION-38's own IT coverage, the first real (non-mocked) exercise of this insert.
            Long postId = postService.createSessionPost(config.getOwnerId(), "Recurring session");

            Session session = Session.builder()
                    .groupId(config.getGroupId())
                    .isPublic(false)
                    .postId(postId)
                    .sessionType(SessionType.GROUP_RECURRING)
                    .createdBy(config.getOwnerId())
                    .sportId(config.getSportId())
                    .locationId(config.getRecurrenceLocationId())
                    .locationNote(config.getRecurrenceLocationNote())
                    .scheduledStart(nextOccurrence)
                    .scheduledEndAt(scheduledEndAt)
                    .status(SessionStatus.SCHEDULED)
                    .build();

            try {
                sessionRepository.save(session);
                log.info("Auto-generated session for group {} at {}", config.getGroupId(), nextOccurrence);
            } catch (DataIntegrityViolationException e) {
                // The unique (group_id, scheduled_start) constraint is the idempotency backstop
                // for a race between two job runs/instances — not a real error.
                log.debug("Session for group {} at {} already exists (race), skipping", config.getGroupId(), nextOccurrence);
            }
        }
    }

    /** Falls back to the JVM's own zone when the location carries no timezone (LOC-4: best-effort,
     * nullable) or doesn't resolve at all (a race with the location being deleted — shouldn't
     * happen, no delete path exists yet, but never worth failing job execution over). */
    private ZoneId resolveZone(LocationResponse location) {
        if (location == null || location.getTimezone() == null) {
            return ZoneId.systemDefault();
        }
        return ZoneId.of(location.getTimezone());
    }

    /** SCHEDULED → ONGOING once scheduledStart arrives (only for sessions with a scheduledEndAt
     * — see {@link SessionRepository#findSessionsToStart}). SESSION-18: also writes one
     * {@code session.status.started} outbox row per started session, in the same transaction — no
     * real actor (a scheduled job made the transition), so {@link SessionStatusStartedEvent}
     * carries no {@code actorId}, unlike every other session event. */
    @Transactional
    public void startOngoingSessions() {
        Instant now = Instant.now();
        Pageable pageable = PageRequest.of(0, START_BATCH_SIZE);
        Slice<Session> batch;
        do {
            // Always re-query page 0 — rows flipped to ONGOING below drop out of this
            // SCHEDULED-status filter, so the "next" batch is always page 0 again.
            batch = sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, now, pageable);
            if (batch.isEmpty()) {
                break;
            }
            List<Session> sessions = batch.getContent();
            sessions.forEach(s -> s.setStatus(SessionStatus.ONGOING));
            sessionRepository.saveAll(sessions);

            List<SessionOutboxEvent> outboxEvents = sessions.stream()
                    .map(s -> sessionOutboxWriter.build("session.status.started",
                            SessionStatusStartedEvent.builder().sessionId(s.getId()).build()))
                    .collect(Collectors.toList());
            sessionOutboxEventRepository.saveAll(outboxEvents);

            // SESSION-21: one system entry per started session, written as a single batch —
            // one query to validate every SESSION_POST and one saveAll, rather than a call per
            // session across a batch of up to START_BATCH_SIZE. Authored by each session's own
            // createdBy (this is the one trigger point with no actor at all), and deliberately
            // separate from the outbox row above: the started notification is that event's job,
            // and this must not also fire session.comment.created.
            List<SystemSessionCommentRequest> systemComments = sessions.stream()
                    .map(s -> SystemSessionCommentRequest.builder()
                            .postId(s.getPostId())
                            .authorUserId(s.getCreatedBy())
                            .content("The session has started")
                            .build())
                    .collect(Collectors.toList());
            commentService.createSystemSessionComments(systemComments);

            log.info("Started {} session(s)", sessions.size());
        } while (batch.hasNext());
    }

    /**
     * SCHEDULED or ONGOING → COMPLETED once the session's effective end has passed.
     *
     * <p><b>SESSION-38:</b> also the on-completion event-driven generation trigger — for whichever
     * {@code GROUP_RECURRING} sessions this batch just completed, generates each of their groups'
     * next occurrence directly, replacing the old hourly sweep's job of eventually noticing the
     * occurrence was missing. Batched per page (never one {@code group-api}/{@code
     * generateForConfigs} call per session, per CLAUDE.md's no-N+1 rule), and skipped entirely when
     * a page has no group-linked completions — the common case for a standalone-heavy batch. A
     * failure here is isolated in its own try/catch: it must not roll back this page's legitimate
     * COMPLETED transitions, which already succeeded before generation was ever attempted (same
     * failure-isolation principle as {@code GroupServiceImpl}'s own trigger call; see SESSION-41
     * for the follow-up on retrying a failure like this one).
     */
    @Transactional
    public void closePastSessions() {
        Instant cutoff = Instant.now();
        Pageable pageable = PageRequest.of(0, CLOSE_BATCH_SIZE);
        List<SessionStatus> openStatuses = List.of(SessionStatus.SCHEDULED, SessionStatus.ONGOING);
        Slice<Session> batch;
        do {
            // Always re-query page 0 — rows flipped to COMPLETED below drop out of this
            // status filter, so the "next" batch is always page 0 again.
            batch = sessionRepository.findSessionsToComplete(openStatuses, cutoff, pageable);
            if (batch.isEmpty()) {
                break;
            }
            List<Session> sessions = batch.getContent();
            sessions.forEach(s -> s.setStatus(SessionStatus.COMPLETED));
            sessionRepository.saveAll(sessions);
            log.info("Closed {} past session(s)", sessions.size());

            List<Long> completedGroupIds = sessions.stream()
                    .filter(s -> s.getSessionType() == SessionType.GROUP_RECURRING)
                    .map(Session::getGroupId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .collect(Collectors.toList());
            if (!completedGroupIds.isEmpty()) {
                try {
                    generateForConfigs(groupService.getGroupRecurrenceConfigsByGroupIds(completedGroupIds));
                } catch (Exception e) {
                    log.warn("Event-driven session generation failed for completed groups {} — "
                            + "will only retry on the next trigger for each group (SESSION-41 "
                            + "tracks a real backstop)", completedGroupIds, e);
                }
            }
        } while (batch.hasNext());
    }

    /** SESSION-24: PREPARING -> CANCELLED once scheduledStart passes without the creator
     * completing locationId/feeType. No real actor (a scheduled job made the transition, same as
     * startOngoingSessions) — cancelledBy stays null. No outbox event or system comment: whether
     * this should notify anyone is an open question, logged as NOTIF-7 in
     * documentation/md/NOTIFICATION_USE_CASES.md rather than decided here. */
    @Transactional
    public void cancelUnpreparedSessions() {
        Instant cutoff = Instant.now();
        Pageable pageable = PageRequest.of(0, CANCEL_UNPREPARED_BATCH_SIZE);
        Slice<Session> batch;
        do {
            // Always re-query page 0 — rows flipped to CANCELLED below drop out of this
            // PREPARING-status filter, so the "next" batch is always page 0 again.
            batch = sessionRepository.findUnpreparedSessionsToCancel(SessionStatus.PREPARING, cutoff, pageable);
            if (batch.isEmpty()) {
                break;
            }
            List<Session> sessions = batch.getContent();
            LocalDateTime cancelledAt = LocalDateTime.now();
            sessions.forEach(s -> {
                s.setStatus(SessionStatus.CANCELLED);
                s.setCancelReason(UNPREPARED_CANCEL_REASON);
                s.setCancelledAt(cancelledAt);
            });
            sessionRepository.saveAll(sessions);
            log.info("Auto-cancelled {} unprepared session(s)", sessions.size());
        } while (batch.hasNext());
    }

    private boolean hasCompleteRecurrenceRule(GroupRecurrenceConfigResponse config) {
        return config.getRecurrenceDayOfWeek() != null
                && config.getRecurrenceTime() != null
                && config.getRecurrenceLocationId() != null;
    }

    LocalDateTime computeNextOccurrence(DayOfWeek dayOfWeek, LocalTime time) {
        LocalDate today = LocalDate.now();
        LocalDate nextDate = today.with(TemporalAdjusters.nextOrSame(dayOfWeek));
        LocalDateTime candidate = LocalDateTime.of(nextDate, time);
        if (!candidate.isAfter(LocalDateTime.now())) {
            candidate = candidate.plusWeeks(1);
        }
        return candidate;
    }
}
