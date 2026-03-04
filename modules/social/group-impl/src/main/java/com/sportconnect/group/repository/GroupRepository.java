package com.sportconnect.group.repository;

import com.sportconnect.group.entity.Group;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, Long> {

    Optional<Group> findByGroupName(String groupName);

    boolean existsByGroupName(String groupName);

    Optional<Group> findByIdAndIsActiveTrue(Long id);

    Page<Group> findByIsActiveTrueAndIsPrivateFalse(Pageable pageable);

    @Query("SELECT g FROM Group g WHERE g.createdBy = :userId AND g.isActive = true")
    Page<Group> findByCreatedByAndIsActiveTrue(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT COUNT(gm) FROM GroupMember gm WHERE gm.groupId = :groupId")
    long countMembersByGroupId(@Param("groupId") Long groupId);
}
