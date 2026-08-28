package com.sportconnect.user.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.user.entity.UserOutboxEvent;
import com.sportconnect.user.repository.UserOutboxEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Builds and persists {@code user_outbox_events} rows (U13) — same role as {@code session-impl}'s
 * {@code SessionOutboxWriter}. Extracted from {@code UserFriendServiceImpl} so the outbox-row
 * construction lives in one place if a second writer is ever added in this module.
 */
@Component
@RequiredArgsConstructor
public class UserOutboxWriter {

    private final UserOutboxEventRepository userOutboxEventRepository;
    private final ObjectMapper objectMapper;

    /**
     * Serializes {@code payload} and saves one outbox row in the <em>caller's</em> transaction —
     * never a separate one, so a rollback of the triggering friend-request write also rolls this
     * back (the whole point of the transactional-outbox pattern). A serialization failure is a
     * programmer error (the payload types are this module's own {@code user-api} event DTOs), so
     * it's rethrown unchecked rather than swallowed.
     *
     * @param eventType doubles as the RabbitMQ routing key {@code UserOutboxRelayJob} publishes with
     * @param payload   a {@code com.sportconnect.user.api.event} DTO
     */
    public void record(String eventType, Object payload) {
        UserOutboxEvent event = new UserOutboxEvent();
        event.setEventType(eventType);
        try {
            event.setPayload(objectMapper.writeValueAsString(payload));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload for " + eventType, e);
        }
        userOutboxEventRepository.save(event);
    }
}
