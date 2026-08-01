package com.sportconnect.location.repository;

import com.sportconnect.location.entity.Location;
import com.sportconnect.location.entity.UserFavoriteLocation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface UserFavoriteLocationRepository extends JpaRepository<UserFavoriteLocation, Long> {

    boolean existsByUserIdAndLocationId(UUID userId, Long locationId);

    void deleteByUserIdAndLocationId(UUID userId, Long locationId);

    /**
     * Implicit join against {@code Location} (both entities live in this module, so no
     * cross-domain concern) — resolves a favorite's sport via {@code Location.sportId} rather
     * than a denormalized column, filtered and paginated at the DB level in one query.
     */
    @Query("SELECT l FROM Location l, UserFavoriteLocation f "
            + "WHERE f.locationId = l.id AND f.userId = :userId AND l.sportId = :sportId")
    Page<Location> findFavoritesByUserIdAndSportId(
            @Param("userId") UUID userId, @Param("sportId") Long sportId, Pageable pageable);
}
