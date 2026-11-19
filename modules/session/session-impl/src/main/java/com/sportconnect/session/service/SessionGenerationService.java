package com.sportconnect.session.service;

import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.event.SessionStatusStartedEvent;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.dto.SystemSessionCommentRequest;
import com.sportconnect.social.post.api.service.CommentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Internal only — not exposed via {@code session-api}; its caller is {@link com.sportconnect.session.job.SessionGenerationJob}
 * (the three 15-minute status jobs). It drives {@code SCHEDULED} to {@code ONGOING} to {@code COMPLETED} automatically.
 *
 * <p><b>SESSION-GROUP-5:</b> it no longer generates sessions. The old single-rule generator (SESSION-2, SESSION-38: one next
 * occurrence per group, read from the {@code groups.recurrence_*} columns) is replaced by the queue in this package
 * ({@link GroupSessionGenerationPlanner}, {@link GroupSessionGenerationRunner}, {@link GroupSessionOccurrenceGenerator}).
 * What is left here is {@link #closePastSessions}'s part in it: telling the planner which regular sessions just ended.
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
    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final SessionOutboxWriter sessionOutboxWriter;
    private final CommentService commentService;
    private final ApplicationEventPublisher eventPublisher;

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
                            .systemCode(SystemCode.SESSION_STARTED)
                            .build())
                    .collect(Collectors.toList());
            commentService.createSystemSessionComments(systemComments);

            log.info("Started {} session(s)", sessions.size());
        } while (batch.hasNext());
    }

    /**
     * SCHEDULED or ONGOING → COMPLETED once the session's effective end has passed.
     *
     * <p><b>SESSION-GROUP-5:</b> also tells the generator which <em>regular</em> group sessions (the ones with a
     * {@code recurrenceId}) just completed, as one event per page, handled after this transaction commits: the last regular
     * session of a day completing queues the group's next day. Custom group sessions and standalone ones are never reported.
     * A failure in the generator can never undo the COMPLETED transitions (it runs after the commit and is caught there).
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

            List<GroupSessionGenerationEvents.GroupDay> endedDays = sessions.stream()
                    .filter(s -> s.getRecurrenceId() != null && s.getGroupId() != null && s.getOccurrenceDate() != null)
                    .map(s -> new GroupSessionGenerationEvents.GroupDay(s.getGroupId(), s.getOccurrenceDate()))
                    .distinct()
                    .collect(Collectors.toList());
            if (!endedDays.isEmpty()) {
                eventPublisher.publishEvent(new GroupSessionGenerationEvents.RegularSessionsEnded(endedDays));
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

    /**
     * SESSION-49: the title of a generated session, after its group, in the owner's language (it is stored text, so one
     * language is fixed when the job runs): en {@code "<group>'s session"}, vi {@code "Trận đấu của nhóm <group>"}.
     * Any other or unknown language gets the English one. Cut to the column's 200 characters.
     */
    static String generatedTitle(String groupName, String languageCode) {
        String name = groupName == null ? "" : groupName.trim();
        String title = "vi".equals(languageCode) ? "Trận đấu của nhóm " + name : name + "'s session";
        return title.length() <= 200 ? title : title.substring(0, 200);
    }
}
