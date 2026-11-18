package com.sportconnect.session.service;

import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.event.SessionGroupCancelledEvent;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * SESSION-GROUP-6 — cancels a set of scheduled regular group sessions on behalf of an owner or admin who turned generation off,
 * switched the mode or deleted a configuration. Joins the caller's transaction (the cancel and the change that asked for it
 * commit together). It deliberately does <b>not</b> go through {@code SessionServiceImpl.cancelSession}: that publishes the
 * "a regular session ended" event, which would queue the next day, and a cancel made because the owner switched generation off
 * or removed a configuration must never bring a session back.
 *
 * <p>Each session's audience and players are told with {@code session.group.cancelled} (the actor excluded), as for any group
 * cancel. The sessions are few (generation keeps one nearest day queued), so the recipients are resolved per session.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RegularSessionCanceller {

    /** What "scheduled" means here: not yet started. An {@code ONGOING} session is never cancelled by a rule change. */
    static final List<SessionStatus> SCHEDULED_STATUSES = List.of(SessionStatus.SCHEDULED, SessionStatus.PREPARING);

    private final SessionRepository sessionRepository;
    private final SessionOutboxEventRepository outboxRepository;
    private final SessionOutboxWriter outboxWriter;
    private final GroupSessionRecipients recipients;

    /** @return how many sessions were cancelled */
    public int cancel(List<Session> sessions, UUID actorId, String reason) {
        if (sessions.isEmpty()) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Session session : sessions) {
            session.setStatus(SessionStatus.CANCELLED);
            session.setCancelReason(reason);
            session.setCancelledBy(actorId);
            session.setCancelledAt(now);
        }
        sessionRepository.saveAll(sessions);
        List<com.sportconnect.session.entity.SessionOutboxEvent> events = new ArrayList<>();
        for (Session session : sessions) {
            for (UUID recipientId : recipients.of(session, actorId, true)) {
                events.add(outboxWriter.build("session.group.cancelled", SessionGroupCancelledEvent.builder()
                        .sessionId(session.getId())
                        .actorId(actorId)
                        .recipientUserId(recipientId)
                        .groupId(session.getGroupId())
                        .build()));
            }
        }
        if (!events.isEmpty()) {
            outboxRepository.saveAll(events);
        }
        log.info("Cancelled {} scheduled regular session(s) for group {}: {}", sessions.size(), sessions.get(0).getGroupId(), reason);
        return sessions.size();
    }
}
