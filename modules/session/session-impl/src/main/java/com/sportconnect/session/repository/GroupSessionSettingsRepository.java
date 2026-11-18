package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionSettings;
import org.springframework.data.jpa.repository.JpaRepository;

/** SESSION-GROUP-4 — keyed by the group id. */
public interface GroupSessionSettingsRepository extends JpaRepository<GroupSessionSettings, Long> {
}
