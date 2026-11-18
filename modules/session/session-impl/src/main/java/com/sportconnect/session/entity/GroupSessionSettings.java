package com.sportconnect.session.entity;

import com.sportconnect.session.api.dto.RecurrenceMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/** SESSION-GROUP-4 — a group's regular-session settings. No row means OFF and WEEKLY. {@code groupId} is cross-domain: no FK. */
@Entity
@Table(name = "group_session_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSessionSettings {

    @Id
    @Column(name = "group_id")
    private Long groupId;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private RecurrenceMode mode = RecurrenceMode.WEEKLY;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
