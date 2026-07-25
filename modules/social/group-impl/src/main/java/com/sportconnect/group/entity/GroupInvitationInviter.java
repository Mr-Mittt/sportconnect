package com.sportconnect.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * B14: one row per member who has invited a given invitee to a given group, for a single
 * canonical {@link GroupInvitation} row. Backing table for {@code GroupInvitationResponse
 * .inviterFullNames} — when a second member invites someone already pending an invitation from a
 * first member, this records the second member here rather than creating a second
 * {@code GroupInvitation} row (which would reintroduce the two-independently-transitioned-rows
 * race B11 was filed to eliminate).
 */
@Entity
@Table(name = "group_invitation_inviters")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupInvitationInviter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invitation_id", nullable = false)
    private Long invitationId;

    @Column(name = "inviter_id", nullable = false)
    private UUID inviterId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GroupInvitationInviter)) return false;
        GroupInvitationInviter that = (GroupInvitationInviter) o;
        return id != null && id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
