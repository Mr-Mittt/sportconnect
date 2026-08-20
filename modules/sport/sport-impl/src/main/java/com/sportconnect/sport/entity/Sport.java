package com.sportconnect.sport.entity;

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
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "sports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Sport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 50)
    private String category;

    @Column(name = "icon_url", length = 500)
    private String iconUrl;

    @Column(name = "min_players")
    private Integer minPlayers;

    @Column(name = "max_players")
    private Integer maxPlayers;

    /**
     * A9: the sport's attribute definition tree (version/groups/attributes), or {@code null} when
     * the sport offers no attributes at all. Read and written through {@code SportAttributeSchema}
     * DTOs; the typed shape lives at the API boundary, not here.
     *
     * <p>Deliberately an untyped {@code Map} rather than the {@code SportAttributeSchema} DTO.
     * {@code Sport} is loaded on the hot path by {@code SportLookupCache.getActiveSportsById()}; a
     * strongly-typed field would make a document that no longer deserialises (an attribute type
     * added or retired since it was written) throw while loading <em>the whole sport catalogue</em>,
     * not just the one schema. Untyped here contains that blast radius to the endpoint that
     * actually parses it. Also reuses A3's already-verified JSON mapping on
     * {@code UserSportProfile.attributes} instead of introducing an unproven POJO-to-JSON one.
     *
     * <p>Not {@code @Builder.Default}-initialised: unlike A3's attributes map, {@code null} is a
     * meaningful state here and means "no attributes offered".
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attributes_schema", columnDefinition = "jsonb")
    private Map<String, Object> attributesSchema;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Sport)) return false;
        Sport sport = (Sport) o;
        return id != null && id.equals(sport.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
