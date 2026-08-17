package com.sportconnect.session.entity;

import com.sportconnect.common.outbox.OutboxEvent;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * This module's own outbox table (SESSION-15), built on {@link OutboxEvent}'s shared shape (C3).
 * See {@code modules/session/docs/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md} for the full event
 * list and design.
 */
@Entity
@Table(name = "session_outbox_events")
public class SessionOutboxEvent extends OutboxEvent {
}
