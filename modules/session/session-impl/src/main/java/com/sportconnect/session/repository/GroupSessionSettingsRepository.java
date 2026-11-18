package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionSettings;
import org.springframework.data.jpa.repository.JpaRepository;

/** SESSION-GROUP-4 — keyed by the group id. */
public interface GroupSessionSettingsRepository extends JpaRepository<GroupSessionSettings, Long> {

    /** SESSION-GROUP-5 — the groups that have regular-session generation on (the startup recovery's starting point). */
    java.util.List<GroupSessionSettings> findByEnabledTrue();

    /** SESSION-GROUP-5 — the settings of these groups, in one query. */
    java.util.List<GroupSessionSettings> findByGroupIdInAndEnabledTrue(java.util.Collection<Long> groupIds);
}
