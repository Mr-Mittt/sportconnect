package com.sportconnect.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
import org.hibernate.annotations.UpdateTimestamp;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "groups")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Group {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_name", unique = true, nullable = false, length = 100)
    private String groupName;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String rules = "";

    /** Free-text notes, owner-editable prose — kept as-is; see recurrence* fields below for the
     * structured rule the session-generation job actually reads (SESSION-2). */
    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String schedule = "";

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence_day_of_week", length = 10)
    private DayOfWeek recurrenceDayOfWeek;

    @Column(name = "recurrence_time")
    private LocalTime recurrenceTime;

    @Column(name = "recurrence_duration_minutes")
    private Integer recurrenceDurationMinutes;

    /** References modules/location's shared Location table — no JPA relation, id only. */
    @Column(name = "recurrence_location_id")
    private Long recurrenceLocationId;

    /** Copied verbatim into Session.locationNote on every auto-generated occurrence — e.g.
     * "always Court 3". */
    @Column(name = "recurrence_location_note", length = 500)
    private String recurrenceLocationNote;

    @Column(name = "sport_id")
    private Long sportId;

    @Column(name = "is_private")
    @Builder.Default
    private Boolean isPrivate = false;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Group)) return false;
        Group group = (Group) o;
        return id != null && id.equals(group.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
