package com.sportconnect.auth.api.service;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.dto.RegisterRequest;

import java.util.UUID;

/**
 * Authentication service interface
 */
public interface AuthService {

    /**
     * Register a new user
     */
    AuthResponse register(RegisterRequest request);

    /**
     * Authenticate user and generate tokens
     */
    AuthResponse login(LoginRequest request);

    /**
     * Refresh access token using refresh token
     */
    AuthResponse refreshToken(String refreshToken);

    /**
     * Logout user and revoke tokens
     */
    void logout(UUID userId);
}
