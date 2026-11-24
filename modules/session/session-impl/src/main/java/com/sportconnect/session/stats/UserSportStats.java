package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-53: one user's statistics in one sport, as blobs (read whole, written by the statistics job under the row's
 * lock). {@code personal} holds the counters of all games and of ranking games, {@code groupings} the same per group of
 * players the sport's schema asks for (each partner, each team of two), {@code scopes} one entry per region and country
 * where the player earned ranking games (the venue's, wherever the player lives), {@code history} pointers to the counted
 * games, newest first. The shapes are read and written by {@link PlayerStatsDoc} and documented in
 * {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}; nothing else touches these maps.
 */
@Entity
@Table(name = "user_sport_stats")
@IdClass(UserSportStats.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserSportStats {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "personal", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> personal = new LinkedHashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "groupings", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> groupings = new LinkedHashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "scopes", columnDefinition = "jsonb", nullable = false)
    private List<Object> scopes = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "history", columnDefinition = "jsonb", nullable = false)
    private List<Object> history = new ArrayList<>();

    /** A safety check on top of the row lock: a write that lost a race fails instead of overwriting. */
    @Version
    @Column(name = "version")
    private Integer version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public UserSportStats(UUID userId, Long sportId) {
        this.userId = userId;
        this.sportId = sportId;
    }

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private UUID userId;
        private Long sportId;
    }
}
