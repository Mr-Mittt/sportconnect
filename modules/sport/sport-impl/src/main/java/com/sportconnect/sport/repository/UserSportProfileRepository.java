package com.sportconnect.sport.repository;

import com.sportconnect.sport.entity.UserSportProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserSportProfileRepository extends JpaRepository<UserSportProfile, Long> {

    List<UserSportProfile> findByUserId(UUID userId);

    List<UserSportProfile> findByUserIdAndIsActiveTrue(UUID userId);

    Optional<UserSportProfile> findByUserIdAndSportId(UUID userId, Long sportId);

    boolean existsByUserIdAndSportId(UUID userId, Long sportId);

    /**
     * Active-scoped counterpart of {@link #existsByUserIdAndSportId} — excludes soft-deleted
     * profiles ({@code isActive = false}, set by {@code deleteProfile}). Backs
     * {@code UserSportProfileServiceImpl.hasActiveProfileForActiveSport}; the unfiltered variant
     * above must not be used as an access gate (A7).
     */
    boolean existsByUserIdAndSportIdAndIsActiveTrue(UUID userId, Long sportId);

    /**
     * Active-scoped counterparts of the two finders above. A7: the unfiltered versions match
     * soft-deleted rows, so they must not back any read or write that treats "found" as "the user
     * has this profile" — {@code findByUserIdAndSportId} remains, but only for
     * {@code createProfile}'s reactivation path, which specifically needs to see the deleted row.
     */
    Optional<UserSportProfile> findByIdAndIsActiveTrue(Long id);

    Optional<UserSportProfile> findByUserIdAndSportIdAndIsActiveTrue(UUID userId, Long sportId);
}
