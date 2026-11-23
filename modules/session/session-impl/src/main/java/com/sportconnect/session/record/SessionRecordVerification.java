package com.sportconnect.session.record;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * SESSION-72: one player's confirmation of a record proposed as a ranking game. One row per (record, player), so a
 * player confirming again after an edit overwrites their row with the new {@code revision}. The confirmation counts only
 * while {@code revision} equals the record's current revision. {@code userId} is an id only (no cross-domain FK);
 * {@code recordId} is a same-domain foreign key with {@code ON DELETE CASCADE}.
 */
@Entity
@Table(name = "session_record_verifications")
@IdClass(SessionRecordVerification.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionRecordVerification {

    @Id
    @Column(name = "record_id", nullable = false)
    private Long recordId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** The record revision this player confirmed. */
    @Column(name = "revision", nullable = false)
    private Integer revision;

    @Column(name = "verified_at", nullable = false)
    private Instant verifiedAt;

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long recordId;
        private UUID userId;
    }
}
