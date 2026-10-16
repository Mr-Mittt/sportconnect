package com.sportconnect.notification.config;

import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.user.api.dto.UserAccessState;
import com.sportconnect.user.api.service.UserService;
import java.security.Principal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Authenticates a STOMP session at {@code CONNECT} time, via the frame's {@code Authorization}
 * native header — not the WS handshake's HTTP headers. Unlike a raw browser {@code WebSocket}
 * (which can't set custom headers during the handshake, forcing e.g. {@code services/chat}'s
 * query-param fallback for its one WS route), a STOMP client library can set arbitrary headers on
 * the {@code CONNECT} frame itself, so no such workaround is needed here.
 *
 * <p>Uses {@link JwtTokenService} ({@code auth-api}) — the same cross-domain-safe interface
 * {@code JwtAuthenticationFilter} uses internally in {@code auth-impl} — so this stays consistent
 * with the REST JWT validation path without importing anything from {@code auth-impl}.
 *
 * <p><b>The active gate (A28, closing A20's STOMP half):</b> after the token verifies, the user must pass the same
 * check every REST request does ({@link UserService#getAccessState}, A25): a deactivated or unprovisioned user's
 * {@code CONNECT} is refused. The check runs at {@code CONNECT} only, so a socket that is already open when the account
 * is deactivated stays open until the client reconnects (and is then refused); it carries only that user's own
 * notifications. Disconnecting open sockets on deactivation is a separate, low-priority ticket (see the notification
 * backlog).
 */
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtTokenService jwtTokenService;
    private final UserService userService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = bearerToken(accessor.getFirstNativeHeader("Authorization"));
            if (token == null || !jwtTokenService.validateToken(token) || jwtTokenService.isTokenExpired(token)) {
                throw new StompAuthenticationException("Missing or invalid token on STOMP CONNECT");
            }
            String userId = jwtTokenService.getUserIdFromToken(token);
            if (!isActive(userId)) {
                throw new StompAuthenticationException("Account is not active");
            }
            accessor.setUser(new StompPrincipal(userId));
        }
        return message;
    }

    /** The A25 gate: the account exists and is active. A subject that is not a UUID cannot be one of ours. */
    private boolean isActive(String subject) {
        try {
            return userService.getAccessState(UUID.fromString(subject)).map(UserAccessState::isActive).orElse(false);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String bearerToken(String header) {
        if (!StringUtils.hasText(header) || !header.startsWith("Bearer ")) {
            return null;
        }
        return header.substring("Bearer ".length());
    }

    private record StompPrincipal(String name) implements Principal {
        @Override
        public String getName() {
            return name;
        }
    }

    static class StompAuthenticationException extends RuntimeException {
        StompAuthenticationException(String message) {
            super(message);
        }
    }
}
