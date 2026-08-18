package com.sportconnect.session.service;

import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.event.SessionStatusStartedEvent;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Internal only — not exposed via {@code session-api}; its only caller is
 * {@link com.sportconnect.session.job.SessionGenerationJob} in this same module. Always
 * maintains exactly the single next occurrence per group (not a multi-week window) — extending
 * that later is a small additive change, deliberately not built now.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionGenerationService {

    private static final int START_BATCH_SIZE = 200;
    private static final int CLOSE_BATCH_SIZE = 200;

    private final SessionRepository sessionRepository;
    private final GroupService groupService;
    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final SessionOutboxWriter sessionOutboxWriter;

    @Transactional
    public void generateUpcomingSessions() {
        List<GroupRecurrenceConfigResponse> configs = groupService.getGroupsWithAutoGenerateSessionsEnabled();
        for (GroupRecurrenceConfigResponse config : configs) {
            if (!hasCompleteRecurrenceRule(config)) {
                log.debug("Skipping group {} — incomplete recurrence rule", config.getGroupId());
                continue;
            }

            LocalDateTime nextOccurrence = computeNextOccurrence(config.getRecurrenceDayOfWeek(), config.getRecurrenceTime());

            if (sessionRepository.existsByGroupIdAndScheduledStart(config.getGroupId(), nextOccurrence)) {
                continue;
            }

            LocalDateTime scheduledEndAt = config.getRecurrenceDurationMinutes() != null
                    ? nextOccurrence.plusMinutes(config.getRecurrenceDurationMinutes())
                    : null;

            Session session = Session.builder()
                    .groupId(config.getGroupId())
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

    /** SCHEDULED → ONGOING once scheduledStart arrives (only for sessions with a scheduledEndAt
     * — see {@link SessionRepository#findSessionsToStart}). SESSION-18: also writes one
     * {@code session.status.started} outbox row per started session, in the same transaction — no
     * real actor (a scheduled job made the transition), so {@link SessionStatusStartedEvent}
     * carries no {@code actorId}, unlike every other session event. */
    @Transactional
    public void startOngoingSessions() {
        LocalDateTime now = LocalDateTime.now();
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

            log.info("Started {} session(s)", sessions.size());
        } while (batch.hasNext());
    }

    /** SCHEDULED or ONGOING → COMPLETED once the session's effective end has passed. */
    @Transactional
    public void closePastSessions() {
        LocalDateTime cutoff = LocalDateTime.now();
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
