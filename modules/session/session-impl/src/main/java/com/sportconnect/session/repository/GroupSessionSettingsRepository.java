package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** SESSION-GROUP-4 — keyed by the group id. */
public interface GroupSessionSettingsRepository extends JpaRepository<GroupSessionSettings, Long> {

    /**
     * SESSION-55: takes the group's settings row lock for the rest of the transaction ({@code FOR UPDATE}, waiting if another holds it): the
     * mutex that serialises creating and editing the seasons of one group, so two overlapping creates cannot both pass the limit and overlap
     * checks. Must run inside a transaction; a native query so the same SQL text runs on H2 and PostgreSQL.
     */
    @Query(value = "SELECT * FROM group_session_settings WHERE group_id = :groupId FOR UPDATE", nativeQuery = true)
    Optional<GroupSessionSettings> findForUpdate(@Param("groupId") Long groupId);

    /** SESSION-78 — whether the group has switched its statistics and leaderboard on (no row means off); a primary-key read. */
    boolean existsByGroupIdAndStatisticsEnabledTrue(Long groupId);

    /** SESSION-GROUP-5 — the groups that have regular-session generation on (the startup recovery's starting point). */
    java.util.List<GroupSessionSettings> findByEnabledTrue();

    /** SESSION-GROUP-5 — the settings of these groups, in one query. */
    java.util.List<GroupSessionSettings> findByGroupIdInAndEnabledTrue(java.util.Collection<Long> groupIds);
}
