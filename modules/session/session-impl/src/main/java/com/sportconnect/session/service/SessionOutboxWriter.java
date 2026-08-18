package com.sportconnect.session.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Shared outbox-row builder/writer for every service in this module that writes to
 * {@code session_outbox_events} (SESSION-18) — originally private methods on
 * {@code SessionServiceImpl} alone (SESSION-15), extracted once {@code SessionGenerationService}
 * became a second writer for the {@code session.status.started} event.
 */
@Component
@RequiredArgsConstructor
public class SessionOutboxWriter {

    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final ObjectMapper objectMapper;

    /**
     * Builds and saves one outbox row in the caller's own transaction — never a separate
     * transaction, so a rollback of the caller's write also rolls this back.
     */
    public void record(String eventType, Object payload) {
        sessionOutboxEventRepository.save(build(eventType, payload));
    }

    /**
     * Builds without saving — lets a caller collect one row per item in a batch (e.g. one invitee,
     * one auto-started session) and persist them all via a single {@code saveAll} instead of one
     * {@code save()} per item. A serialization failure here is a programmer error (the payload
     * types are this module's own event DTOs), so it's rethrown unchecked rather than swallowed.
     */
    public SessionOutboxEvent build(String eventType, Object payload) {
        SessionOutboxEvent event = new SessionOutboxEvent();
        event.setEventType(eventType);
        try {
            event.setPayload(objectMapper.writeValueAsString(payload));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload for " + eventType, e);
        }
        return event;
    }
}
