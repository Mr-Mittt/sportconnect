package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupInvitationInviter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GroupInvitationInviterRepository extends JpaRepository<GroupInvitationInviter, Long> {

    boolean existsByInvitationIdAndInviterId(Long invitationId, UUID inviterId);

    List<GroupInvitationInviter> findByInvitationIdInOrderByCreatedAt(List<Long> invitationIds);

    long countByInvitationId(Long invitationId);

    @Modifying
    @Query("DELETE FROM GroupInvitationInviter gii WHERE gii.invitationId = :invitationId AND gii.inviterId = :inviterId")
    void deleteByInvitationIdAndInviterId(@Param("invitationId") Long invitationId, @Param("inviterId") UUID inviterId);
}
