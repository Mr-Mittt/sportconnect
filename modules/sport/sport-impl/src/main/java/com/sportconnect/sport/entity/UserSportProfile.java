package com.sportconnect.sport.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_sport_profiles", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "sport_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSportProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Column(name = "skill_level", length = 50)
    private String skillLevel;

    @Column(name = "years_of_experience")
    private Integer yearsOfExperience;

    @Column(name = "preferred_position", length = 100)
    private String preferredPosition;

    @Column(columnDefinition = "TEXT")
    private String bio;

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
        if (!(o instanceof UserSportProfile)) return false;
        UserSportProfile that = (UserSportProfile) o;
        return id != null && id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
