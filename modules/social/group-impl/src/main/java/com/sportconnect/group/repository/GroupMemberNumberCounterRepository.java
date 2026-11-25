package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupMemberNumberCounter;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** SESSION-81: the per-group counter of member numbers. */
public interface GroupMemberNumberCounterRepository extends JpaRepository<GroupMemberNumberCounter, Long> {

    /** The group's counter under a write lock held until the transaction ends: two allocations in one group queue here. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM GroupMemberNumberCounter c WHERE c.groupId = :groupId")
    Optional<GroupMemberNumberCounter> lockOne(@Param("groupId") Long groupId);
}
