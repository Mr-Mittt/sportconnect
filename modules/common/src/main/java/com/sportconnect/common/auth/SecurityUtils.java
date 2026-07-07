package com.sportconnect.common.auth;

import org.springframework.security.core.Authentication;

import java.util.UUID;

public class SecurityUtils {

    private SecurityUtils() {}

    public static UUID extractUserId(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) return null;
        return UUID.fromString((String) auth.getPrincipal());
    }
}
