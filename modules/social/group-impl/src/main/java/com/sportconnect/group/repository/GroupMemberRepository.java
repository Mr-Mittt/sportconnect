package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupMember;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, Long> {

    Optional<GroupMember> findByGroupIdAndUserId(Long groupId, UUID userId);

    boolean existsByGroupIdAndUserId(Long groupId, UUID userId);

    Page<GroupMember> findByGroupId(Long groupId, Pageable pageable);

    List<GroupMember> findByUserId(UUID userId);

    @Query(
        value = "SELECT gm FROM GroupMember gm, Group g WHERE gm.userId = :userId AND gm.groupId = g.id AND g.isActive = true",
        countQuery = "SELECT COUNT(gm) FROM GroupMember gm, Group g WHERE gm.userId = :userId AND gm.groupId = g.id AND g.isActive = true"
    )
    Page<GroupMember> findByUserIdAndGroupIsActiveTrue(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT gm FROM GroupMember gm WHERE gm.groupId = :groupId AND gm.roleId = :roleId")
    List<GroupMember> findByGroupIdAndRoleId(@Param("groupId") Long groupId, @Param("roleId") Integer roleId);

    @Query("SELECT gm FROM GroupMember gm WHERE gm.userId = :userId")
    List<GroupMember> findAllByUserId(@Param("userId") UUID userId);

    void deleteByGroupIdAndUserId(Long groupId, UUID userId);

    long countByGroupId(Long groupId);
}
