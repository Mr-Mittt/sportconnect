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
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SESSION-53 rework: what one group keeps about itself in one sport, as opposed to about a member ({@link GroupMemberStats}).
 * Today that is the head-to-head of its pairs ({@code h2h}), one jsonb document per group and sport, read and written by
 * {@link GroupH2hDoc}. A session-owned table: the group module owns {@code groups}.
 */
@Entity
@Table(name = "group_stats")
@IdClass(GroupStats.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GroupStats implements H2hRow {

    @Id
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Id
    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "h2h", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> h2h = new LinkedHashMap<>();

    @Version
    @Column(name = "version")
    private Integer version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public GroupStats(Long groupId, Long sportId) {
        this.groupId = groupId;
        this.sportId = sportId;
    }

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long groupId;
        private Long sportId;
    }
}
