package com.sportconnect.auth.security;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * A37: reads the caller's roles from a verified Keycloak access token.
 *
 * <p>Keycloak puts the user's effective realm roles in {@code realm_access.roles}. Only the roles this application
 * grants access with are kept ({@link #APPLICATION_ROLES}); Keycloak's own ({@code offline_access},
 * {@code uma_authorization}, {@code default-roles-*}) and anything else are ignored, so a role added to the realm for another
 * purpose can never become an authority by accident. A missing claim, a claim of the wrong shape or an empty list all
 * mean "no roles" (the caller then gets 403 on every endpoint that needs one), never an exception.
 *
 * <p>The token must already have been verified by the {@code JwtDecoder}; this class trusts its content.
 */
public final class TokenRoles {

    /** The roles an endpoint can require: {@code hasRole('USER')} and {@code hasRole('ADMIN')}. */
    static final Set<String> APPLICATION_ROLES = Set.of("USER", "ADMIN");

    private TokenRoles() {
    }

    /**
     * The application roles in {@code jwt}'s {@code realm_access.roles}, sorted, without duplicates.
     *
     * @param jwt a token the {@code JwtDecoder} has verified
     * @return e.g. {@code [ADMIN, USER]}; empty when the token carries none
     */
    public static List<String> of(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (!(realmAccess instanceof Map<?, ?> map)) {
            return List.of();
        }
        Object roles = map.get("roles");
        if (!(roles instanceof Iterable<?> iterable)) {
            return List.of();
        }
        TreeSet<String> kept = new TreeSet<>();
        for (Object role : iterable) {
            if (role instanceof String name && APPLICATION_ROLES.contains(name)) {
                kept.add(name);
            }
        }
        return List.copyOf(kept);
    }
}
