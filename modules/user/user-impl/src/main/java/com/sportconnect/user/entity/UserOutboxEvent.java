package com.sportconnect.user.entity;

import com.sportconnect.common.outbox.OutboxEvent;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * This module's own outbox table (U13), built on {@link OutboxEvent}'s shared shape (C3) — same
 * pattern as {@code session-impl}'s {@code SessionOutboxEvent}. Rows are written in the same
 * transaction as the friend-request write that triggers them and drained to the
 * {@code sportconnect.events} exchange by {@code UserOutboxRelayJob}. See
 * {@code modules/user/user-impl/docs/MVP/U13_NOTIFICATION_OUTBOX_WIRING_FRIEND_REQUEST_RECEIVED_ACCEPTED.md}
 * for the event list and design.
 */
@Entity
@Table(name = "user_outbox_events")
public class UserOutboxEvent extends OutboxEvent {
}
