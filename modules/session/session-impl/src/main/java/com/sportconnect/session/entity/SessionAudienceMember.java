package com.sportconnect.session.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

import java.util.UUID;

/**
 * SESSION-GROUP-1 — one member chosen for a group session whose audience is {@code SPECIFIC}. It decides only who is
 * notified (creation, cancel); it is not a participant row and gives no access. {@code userId} is cross-domain, so no FK.
 */
@Entity
@Table(name = "session_audience_members", uniqueConstraints = {
        @UniqueConstraint(name = "unique_session_audience_member", columnNames = {"session_id", "user_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionAudienceMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;
}
