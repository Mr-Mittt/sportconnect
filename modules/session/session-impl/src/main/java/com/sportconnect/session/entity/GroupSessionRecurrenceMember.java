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

/** SESSION-GROUP-4 — one chosen member of a {@code SPECIFIC} recurrence audience. {@code userId} is cross-domain: no FK. */
@Entity
@Table(name = "group_session_recurrence_members", uniqueConstraints = {
        @UniqueConstraint(name = "unique_group_session_recurrence_member", columnNames = {"recurrence_id", "user_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSessionRecurrenceMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recurrence_id", nullable = false)
    private Long recurrenceId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;
}
