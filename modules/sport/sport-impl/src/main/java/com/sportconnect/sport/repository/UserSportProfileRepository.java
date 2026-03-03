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
}
