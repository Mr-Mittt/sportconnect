package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupInvitation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
