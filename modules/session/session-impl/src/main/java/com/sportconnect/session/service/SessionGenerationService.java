package com.sportconnect.session.service;

import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
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

    private static final int CLOSE_BATCH_SIZE = 200;

    private final SessionRepository sessionRepository;
    private final GroupService groupService;

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

    @Transactional
    public void closePastSessions() {
        LocalDateTime cutoff = LocalDateTime.now();
        Pageable pageable = PageRequest.of(0, CLOSE_BATCH_SIZE);
        Slice<Session> batch;
        do {
            // Always re-query page 0 — rows flipped to COMPLETED below drop out of this
            // SCHEDULED-status filter, so the "next" batch is always page 0 again.
            batch = sessionRepository.findPastScheduledSessions(SessionStatus.SCHEDULED, cutoff, pageable);
            if (batch.isEmpty()) {
                break;
            }
            List<Session> sessions = batch.getContent();
            sessions.forEach(s -> s.setStatus(SessionStatus.COMPLETED));
            sessionRepository.saveAll(sessions);
            log.info("Closed {} past-scheduled session(s)", sessions.size());
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
