package com.sportconnect.user.entity;

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
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", unique = true, nullable = false)
    private UUID userId;

    @Column(length = 10)
    @Builder.Default
    private String language = "en";

    @Column(length = 50)
    @Builder.Default
    private String timezone = "UTC";

    @Column(name = "distance_unit", length = 10)
    @Builder.Default
    private String distanceUnit = "km";

    @Column(name = "notification_email")
    @Builder.Default
    private Boolean notificationEmail = true;

    @Column(name = "notification_push")
    @Builder.Default
    private Boolean notificationPush = true;

    @Column(name = "notification_sms")
    @Builder.Default
    private Boolean notificationSms = false;

    @Column(name = "privacy_profile", length = 20)
    @Builder.Default
    private String privacyProfile = "public";

    @Column(name = "privacy_location", length = 20)
    @Builder.Default
    private String privacyLocation = "friends";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
