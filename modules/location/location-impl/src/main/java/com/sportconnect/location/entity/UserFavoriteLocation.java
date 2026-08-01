package com.sportconnect.location.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A user's favorited {@link Location} (LOC-2). No {@code sportId} column — a favorite's sport is
 * always resolved by joining to {@code Location.sportId}, never denormalized (the write-time gate
 * in {@code LocationServiceImpl.favoriteLocation} already ties every favorite to a sport
 * transitively via an active {@code UserSportProfile}, so a redundant column wasn't worth it).
 */
@Entity
@Table(name = "user_favorite_locations", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "location_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserFavoriteLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "location_id", nullable = false)
    private Long locationId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserFavoriteLocation)) return false;
        UserFavoriteLocation that = (UserFavoriteLocation) o;
        return id != null && id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
