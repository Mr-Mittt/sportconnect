package com.sportconnect.notification.config;

import com.sportconnect.auth.api.service.JwtTokenService;
import java.security.Principal;
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
 * <p><b>Deliberately no {@code isActive} recheck here</b> — this inherits the same known gap as the
 * REST {@code JwtAuthenticationFilter} (CLAUDE.md's account-lifecycle gaps, tracked under
 * {@code user-impl}'s U12: an already-issued access token keeps authenticating a deactivated user
 * until it naturally expires). Confirmed as an accepted, documented risk for this ticket rather than
 * a new gap — not silently missing.
 */
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtTokenService jwtTokenService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = bearerToken(accessor.getFirstNativeHeader("Authorization"));
            if (token == null || !jwtTokenService.validateToken(token) || jwtTokenService.isTokenExpired(token)) {
                throw new StompAuthenticationException("Missing or invalid token on STOMP CONNECT");
            }
            String userId = jwtTokenService.getUserIdFromToken(token);
            accessor.setUser(new StompPrincipal(userId));
        }
        return message;
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
