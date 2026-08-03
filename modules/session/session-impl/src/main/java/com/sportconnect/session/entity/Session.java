package com.sportconnect.session.entity;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "sessions", uniqueConstraints = {
        @UniqueConstraint(name = "unique_group_session_start", columnNames = {"group_id", "scheduled_start"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Session {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id")
    private Long groupId;

    @Enumerated(EnumType.STRING)
    @Column(name = "session_type", nullable = false, length = 30)
    private SessionType sessionType;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Column(length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "location_id", nullable = false)
    private Long locationId;

    /** Free-text detail within the shared Location, e.g. "Court 3" or "North field" —
     * scoped to this one session, never written back to the shared Location row. */
    @Column(name = "location_note", length = 500)
    private String locationNote;

    @Column(name = "scheduled_start", nullable = false)
    private LocalDateTime scheduledStart;

    @Column(name = "scheduled_end_at")
    private LocalDateTime scheduledEndAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SessionStatus status = SessionStatus.SCHEDULED;

    /** "Open slots" — informational/display only, never enforced by joinSession. 9999 is the
     * backfill sentinel for sessions predating this column (and auto-generated recurring
     * sessions, which have no capacity input) — see V040 migration. */
    @Column(nullable = false)
    @Builder.Default
    private Integer capacity = 9999;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_type", nullable = false, length = 10)
    @Builder.Default
    private FeeType feeType = FeeType.FREE;

    /** Meaningful only when feeType == FIXED; SessionServiceImpl clears this to null otherwise. */
    @Column(name = "fee_amount_vnd")
    private Long feeAmountVnd;

    /** Participants the creator already accounts for outside the app (e.g. a team they brought
     * with them) — added on top of the real JOINED SessionParticipant count when SessionServiceImpl
     * reports participantCount. Never negative; 0 for every row predating this column. */
    @Column(name = "initial_slot", nullable = false)
    @Builder.Default
    private Integer initialSlot = 0;

    /** false = joinSession puts non-invited joiners into PENDING, awaiting creator/owner-admin
     * approval. Sessions predating this column backfilled to true (see V041 migration) so their
     * existing instant-join behavior didn't silently change. */
    @Column(name = "auto_approve", nullable = false)
    @Builder.Default
    private Boolean autoApprove = false;

    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    @Column(name = "cancelled_by")
    private UUID cancelledBy;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Session)) return false;
        Session session = (Session) o;
        return id != null && id.equals(session.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
