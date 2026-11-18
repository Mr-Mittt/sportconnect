package com.sportconnect.session.repository;

import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GroupSessionRecurrenceRepository extends JpaRepository<GroupSessionRecurrence, Long> {

    /** A group's recurrences, both modes, by mode, day and start time. Served by {@code idx_group_session_recurrences_group}. */
    List<GroupSessionRecurrence> findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(Long groupId);

    Optional<GroupSessionRecurrence> findByIdAndGroupId(Long id, Long groupId);

    /** The per-day count behind the limit of 5 (drafts count). */
    long countByGroupIdAndModeAndDayKey(Long groupId, RecurrenceMode mode, Integer dayKey);

    /** The same, without one recurrence (the one being updated). */
    long countByGroupIdAndModeAndDayKeyAndIdNot(Long groupId, RecurrenceMode mode, Integer dayKey, Long excludedId);
}
