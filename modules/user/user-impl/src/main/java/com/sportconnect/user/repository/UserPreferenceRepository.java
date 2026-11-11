package com.sportconnect.user.repository;

import com.sportconnect.user.entity.UserPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserPreferenceRepository extends JpaRepository<UserPreference, Long> {
    
    Optional<UserPreference> findByUserId(UUID userId);

    /** SESSION-49: the batch form of {@link #findByUserId}, one query for many users. */
    List<UserPreference> findByUserIdIn(Collection<UUID> userIds);
    
    void deleteByUserId(UUID userId);
}
