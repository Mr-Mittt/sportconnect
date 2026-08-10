package com.sportconnect.group.repository;

import com.sportconnect.group.entity.Group;
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
public interface GroupRepository extends JpaRepository<Group, Long> {

    Optional<Group> findByGroupName(String groupName);

    boolean existsByGroupName(String groupName);

    Optional<Group> findByIdAndIsActiveTrue(Long id);

    Page<Group> findByIsActiveTrueAndIsPrivateFalse(Pageable pageable);

    @Query("SELECT g FROM Group g WHERE g.createdBy = :userId AND g.isActive = true")
    Page<Group> findByCreatedByAndIsActiveTrue(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT COUNT(gm) FROM GroupMember gm WHERE gm.groupId = :groupId")
    long countMembersByGroupId(@Param("groupId") Long groupId);

    @Query("SELECT g, COUNT(gm.groupId) FROM Group g LEFT JOIN GroupMember gm ON gm.groupId = g.id "
            + "WHERE g.id IN :groupIds AND g.isActive = true GROUP BY g")
    List<Object[]> findGroupsWithMemberCounts(@Param("groupIds") List<Long> groupIds);

    @Query("SELECT gm.groupId FROM GroupMember gm, Group g WHERE g.id = gm.groupId AND gm.userId = :userId AND g.sportId IN :sportIds AND g.isActive = true")
    List<Long> findGroupIdsByUserAndSportIds(@Param("userId") UUID userId, @Param("sportIds") List<Long> sportIds);

    @Query(
        value = """
                SELECT g,
                       COUNT(gm.groupId),
                       SUM(CASE WHEN gm.userId = :userId THEN 1 ELSE 0 END)
                FROM Group g
                LEFT JOIN GroupMember gm ON gm.groupId = g.id
                WHERE g.isActive = true AND g.isPrivate = false
                AND (:sportIds IS NULL OR g.sportId IN :sportIds)
                AND (:keyword IS NULL OR LOWER(g.groupName) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')))
                GROUP BY g
                """,
        countQuery = """
                SELECT COUNT(DISTINCT g.id) FROM Group g
                LEFT JOIN GroupMember gm ON gm.groupId = g.id
                WHERE g.isActive = true AND g.isPrivate = false
                AND (:sportIds IS NULL OR g.sportId IN :sportIds)
                AND (:keyword IS NULL OR LOWER(g.groupName) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')))
                """
    )
    Page<Object[]> searchPublicGroupsWithCounts(
            @Param("userId") UUID userId,
            @Param("sportIds") List<Long> sportIds,
            @Param("keyword") String keyword,
            Pageable pageable);

    @Query(
        value = """
                SELECT g,
                       COUNT(gm.groupId)
                FROM Group g
                LEFT JOIN GroupMember gm ON gm.groupId = g.id
                WHERE g.isActive = true AND g.isPrivate = false
                AND (:sportIds IS NULL OR g.sportId IN :sportIds)
                AND (:keyword IS NULL OR LOWER(g.groupName) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')))
                GROUP BY g
                """,
        countQuery = """
                SELECT COUNT(DISTINCT g.id) FROM Group g
                LEFT JOIN GroupMember gm ON gm.groupId = g.id
                WHERE g.isActive = true AND g.isPrivate = false
                AND (:sportIds IS NULL OR g.sportId IN :sportIds)
                AND (:keyword IS NULL OR LOWER(g.groupName) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')))
                """
    )
    Page<Object[]> searchPublicGroupsAnon(
            @Param("sportIds") List<Long> sportIds,
            @Param("keyword") String keyword,
            Pageable pageable);
}
