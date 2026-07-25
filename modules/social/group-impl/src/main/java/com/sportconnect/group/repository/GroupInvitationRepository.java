package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupInvitation;
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
public interface GroupInvitationRepository extends JpaRepository<GroupInvitation, Long> {

    boolean existsByGroupIdAndInviteeIdAndStatusIn(Long groupId, UUID inviteeId, List<String> statuses);

    Optional<GroupInvitation> findByGroupIdAndInviteeIdAndStatusIn(Long groupId, UUID inviteeId, List<String> statuses);

    Page<GroupInvitation> findByGroupIdAndStatus(Long groupId, String status, Pageable pageable);

    Page<GroupInvitation> findByInviteeIdAndStatus(UUID inviteeId, String status, Pageable pageable);

    Page<GroupInvitation> findByGroupIdAndInviterIdAndStatusIn(Long groupId, UUID inviterId, List<String> statuses, Pageable pageable);

    /**
     * B14: same "invitations this person sent for this group that are still in flight" shape as
     * {@link #findByGroupIdAndInviterIdAndStatusIn}, but matches {@code inviterId} against
     * {@code group_invitation_inviters} (any recorded co-inviter) instead of only
     * {@code GroupInvitation.inviterId} (the original/first inviter) — a member who joined an
     * already-pending invitation as a co-inviter should see it in their own sent-invitations list
     * too.
     */
    @Query("SELECT gi FROM GroupInvitation gi WHERE gi.groupId = :groupId AND gi.status IN :statuses "
            + "AND EXISTS (SELECT 1 FROM GroupInvitationInviter gii WHERE gii.invitationId = gi.id AND gii.inviterId = :inviterId)")
    Page<GroupInvitation> findByGroupIdAndCoInviterIdAndStatusIn(
            @Param("groupId") Long groupId, @Param("inviterId") UUID inviterId,
            @Param("statuses") List<String> statuses, Pageable pageable);
}
