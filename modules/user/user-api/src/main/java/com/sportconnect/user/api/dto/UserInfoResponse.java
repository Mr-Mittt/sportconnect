package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * Safe public subset of {@link UserResponse} — U11. Returned by every authenticated-but-not-
 * self lookup ({@code GET /api/users/{userId}}, {@code /email/{email}}, {@code /username/{username}})
 * so a caller looking up another user never gets PII (email, phone, dateOfBirth, gender,
 * height/weight/shoe size, location, lastLoginAt, roles) back, regardless of who's asking. The
 * caller's own full profile is served separately by {@code GET /api/users/me}.
 *
 * <p>U15 added {@link #activeSportIds}: the ids of the sports the user holds an <em>active</em>
 * {@code UserSportProfile} for. This is the one piece a caller rendering another user's sport
 * pills needs — name and icon are resolved client-side — without reopening the full
 * sport-profile read that backend A22 deliberately removed for non-owners.
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

    /**
     * Ids of the sports this user has an active sport profile for. Never {@code null} — an empty
     * list when they have none. Order is not guaranteed (the caller sorts for display).
     */
    private List<Long> activeSportIds;

    /**
     * Build the public view with its sport ids. {@code activeSportIds} is defensively copied into
     * an empty list when {@code null} so the field's "never null" contract always holds.
     */
    public static UserInfoResponse of(UserResponse user, List<Long> activeSportIds) {
        return UserInfoResponse.builder()
                .id(user.getId())
                .fullName(user.getFullName())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .coverUrl(user.getCoverUrl())
                .bio(user.getBio())
                .activeSportIds(activeSportIds == null ? List.of() : List.copyOf(activeSportIds))
                .build();
    }

    /**
     * Convenience overload for callers that have no sport context (tests, and any future caller
     * that only needs the identity fields). Delegates with an empty {@code activeSportIds}.
     */
    public static UserInfoResponse of(UserResponse user) {
        return of(user, List.of());
    }
}
