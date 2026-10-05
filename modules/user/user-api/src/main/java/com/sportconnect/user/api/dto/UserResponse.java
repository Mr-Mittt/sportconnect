package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private UUID id;
    private String email;
    private String firstName;
    private String lastName;
    private String username;
    private String phoneNumber;
    private LocalDate dateOfBirth;
    private String gender;
    private String bio;
    private String avatarUrl;
    private String coverUrl;
    private LocationResponse location;
    private String city;

    /**
     * Display name of the user's country: the linked country's English name when {@link #countryId} is set, else the
     * legacy free text (U16), else {@code null}. <strong>Not resolved by {@code UserService.getUsersByIds}</strong> —
     * see that method: it returns the ids only, because its hot-path callers (feed, comments, group and session
     * lists) never show a country. The single-user reads and {@code searchUsers} do resolve it.
     */
    private String country;

    /** {@code countries.id} in the reference domain, or {@code null}. Set on every path, including the batch lookup. */
    private Long countryId;

    /** {@code regions.id} in the reference domain, or {@code null}. Set on every path, including the batch lookup. */
    private Long regionId;

    /** English name of {@link #regionId}'s region, or {@code null}. Resolved on the same paths as {@link #country}. */
    private String regionName;
    private Integer heightCm;
    private BigDecimal weightKg;
    private Integer shoeSizeMm;
    private Boolean isEmailVerified;
    private Boolean isActive;
    private Set<String> roles;
    private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;

    public String getFullName() {
        if (firstName != null && lastName != null) {
            return firstName + " " + lastName;
        }
        return username != null ? username : email;
    }
}
