package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Safe public subset of {@link UserResponse} — U11. Returned by every authenticated-but-not-
 * self lookup ({@code GET /api/users/{userId}}, {@code /email/{email}}, {@code /username/{username}})
 * so a caller looking up another user never gets PII (email, phone, dateOfBirth, gender,
 * height/weight/shoe size, location, lastLoginAt, roles) back, regardless of who's asking. The
 * caller's own full profile is served separately by {@code GET /api/users/me}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserInfoResponse {

    private UUID id;
    private String fullName;
    private String username;
    private String avatarUrl;
    private String coverUrl;
    private String bio;

    public static UserInfoResponse of(UserResponse user) {
        return UserInfoResponse.builder()
                .id(user.getId())
                .fullName(user.getFullName())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .coverUrl(user.getCoverUrl())
                .bio(user.getBio())
                .build();
    }
}
