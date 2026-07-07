package com.sportconnect.auth.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String accessToken;

    /**
     * Never serialized to the client (see {@link JsonIgnore}) — the refresh token is delivered
     * via an httpOnly {@code Set-Cookie} header instead (see {@code AuthController}). This field
     * exists purely to hand the raw token from the service layer to the controller, which reads
     * it to build that cookie before returning this object as the HTTP response body.
     */
    @JsonIgnore
    private String refreshToken;

    private String tokenType;
    private Long expiresIn;
    private Object user; // Generic object to avoid circular dependency with user module

    public static AuthResponse of(String accessToken, String refreshToken, Long expiresIn, Object user) {
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(expiresIn)
                .user(user)
                .build();
    }
}
