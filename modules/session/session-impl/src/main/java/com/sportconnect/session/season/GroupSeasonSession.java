package com.sportconnect.session.season;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * SESSION-55 (V111): a session an owner or admin linked to a MANUAL season. The key {@code (seasonId, sessionId)} makes a link
 * idempotent; the statistics engine finds the seasons that want a session by {@code sessionId} (an indexed lookup).
 */
@Entity
@Table(name = "group_season_sessions")
@IdClass(GroupSeasonSession.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GroupSeasonSession {

    @Id
    @Column(name = "season_id", nullable = false)
    private Long seasonId;

    @Id
    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "linked_by", nullable = false)
    private UUID linkedBy;

    @Column(name = "linked_at", nullable = false)
    private Instant linkedAt;

    /** The composite primary key. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long seasonId;
        private Long sessionId;
    }
}
