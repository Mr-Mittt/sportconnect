package com.sportconnect.session.record;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-50: one recorded result of a session (a game, later a per-player record). The server
 * stores {@link #data} exactly as the client sent it and never reads it; the players a request names
 * are checked as {@code JOINED} participants and not stored. The id is a database identity value and is never
 * reused, so a stale request can never hit a different record. {@code sessionId} is a plain column:
 * no foreign key, domain-scoped table.
 */
@Entity
@Table(name = "session_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** The sport-specific payload (players, sides, winner, scores), opaque to the server. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> data;

    /** The client's per-add UUID; unique per session, so a retried add never duplicates the record. */
    @Column(name = "client_request_id", nullable = false)
    private UUID clientRequestId;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by", nullable = false)
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
