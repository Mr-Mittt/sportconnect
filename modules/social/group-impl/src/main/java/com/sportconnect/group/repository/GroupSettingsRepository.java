package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupSettings;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupSettingsRepository extends JpaRepository<GroupSettings, Long> {

    Optional<GroupSettings> findByGroupId(Long groupId);

    boolean existsByGroupId(Long groupId);

    /** Used exclusively by the session domain's scheduled generation job (SESSION-2). */
    List<GroupSettings> findByAutoGenerateSessionsTrue();

    void deleteByGroupId(Long groupId);

    /**
     * Row-locks the group's settings for the duration of the caller's transaction. Used by
     * {@code enforceMemberCapacity} so concurrent join/accept/add calls for the same group (across
     * instances or threads) serialize instead of both reading the same pre-insert count and both
     * passing the cap check (B7).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM GroupSettings s WHERE s.groupId = :groupId")
    Optional<GroupSettings> findByGroupIdForUpdate(@Param("groupId") Long groupId);
}
