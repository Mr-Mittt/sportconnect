package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupJoinRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupJoinRequestRepository extends JpaRepository<GroupJoinRequest, Long> {

    Optional<GroupJoinRequest> findByGroupIdAndUserIdAndStatus(Long groupId, UUID userId, String status);

    boolean existsByGroupIdAndUserIdAndStatus(Long groupId, UUID userId, String status);

    Page<GroupJoinRequest> findByGroupIdAndStatus(Long groupId, String status, Pageable pageable);

    Page<GroupJoinRequest> findByUserIdAndStatus(UUID userId, String status, Pageable pageable);

    @Query("SELECT gjr FROM GroupJoinRequest gjr WHERE gjr.groupId = :groupId AND gjr.status = 'pending' ORDER BY gjr.createdAt ASC")
    Page<GroupJoinRequest> findPendingRequestsByGroupId(@Param("groupId") Long groupId, Pageable pageable);

    long countByGroupIdAndStatus(Long groupId, String status);
}
