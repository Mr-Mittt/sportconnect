package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPreferenceResponse {
    private String language;
    private String timezone;
    private String distanceUnit;
    private Boolean notificationEmail;
    private Boolean notificationPush;
    private Boolean notificationSms;
    private String privacyProfile;
    private String privacyLocation;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
