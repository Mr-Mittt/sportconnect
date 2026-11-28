package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** SESSION-55 (V112): what one season keeps about itself, the head-to-head of its pairs, the same shape as {@link GroupStats} (read and written by {@link GroupH2hDoc}). */
@Entity
@Table(name = "season_stats")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SeasonStats implements H2hRow {

    @Id
    @Column(name = "season_id", nullable = false)
    private Long seasonId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "h2h", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> h2h = new LinkedHashMap<>();

    @Version
    @Column(name = "version")
    private Integer version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public SeasonStats(Long seasonId) {
        this.seasonId = seasonId;
    }
}
