package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionGenerationItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface GroupSessionGenerationQueueRepository extends JpaRepository<GroupSessionGenerationItem, Long> {

    /** The items in {@code status} that are due, soonest slot first (the queue order). Served by {@code idx_group_session_queue_due}. */
    @Query("SELECT i FROM GroupSessionGenerationItem i WHERE i.status = :status AND i.nextAttemptAt <= :now "
            + "ORDER BY i.targetStart ASC, i.id ASC")
    List<GroupSessionGenerationItem> findByStatusDue(@Param("status") GroupSessionGenerationItem.Status status,
                                                     @Param("now") Instant now, Pageable pageable);

    /** The {@code PENDING} items that are due: what the runner drains. */
    default List<GroupSessionGenerationItem> findDue(Instant now, Pageable pageable) {
        return findByStatusDue(GroupSessionGenerationItem.Status.PENDING, now, pageable);
    }

    /** Every queue row of these recurrences, in one query (the planner dedupes against it). */
    List<GroupSessionGenerationItem> findByRecurrenceIdIn(Collection<Long> recurrenceIds);
}
