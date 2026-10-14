package com.sportconnect.auth.security;

import com.sportconnect.user.api.dto.UserAccessState;
import com.sportconnect.user.api.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Authenticates a request from its Keycloak access token (A25).
 *
 * <ol>
 *   <li>The token is verified by the {@link JwtDecoder} (RS256 signature against the realm JWKS, expiry, issuer,
 *       audience). A token that fails any of that leaves the request anonymous.</li>
 *   <li>{@code sub} is the {@code users.id}. {@link UserService#getAccessState} (cached, DB fallback) says whether that
 *       user exists and is active, and what roles it holds; roles come from our database, never from a claim. An
 *       unprovisioned {@code sub} or a deactivated user leaves the request anonymous. This is the one
 *       enforcement point for a deactivated caller (U12), so a token issued before the deactivation stops working
 *       at once.</li>
 * </ol>
 *
 * <p>"Anonymous" means the filter chain carries on and Spring answers 401 for any endpoint that needs authentication,
 * while a public endpoint still works for a caller with a stale token.
 *
 * <p>Only an invalid token or an unusable {@code sub} is treated as "not authenticated" (A14). If the key set cannot be
 * fetched (Keycloak down) or the user lookup itself fails (database), the request is still left anonymous but marked
 * with {@link #FAILURE_ATTRIBUTE}, and {@link JwtAuthenticationEntryPoint} answers 503 / 500 instead of a 401, which
 * would make the client discard a perfectly good session and refresh for nothing.
 */
@Component
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /** Request attribute holding the {@link HttpStatus} to answer when the request is not authenticated because of a server-side failure. */
    public static final String FAILURE_ATTRIBUTE = JwtAuthenticationFilter.class.getName() + ".FAILURE";

    private final JwtDecoder jwtDecoder;
    private final UserService userService;

    /**
     * {@code userService} is {@code @Lazy} because of a real startup cycle: {@code SecurityConfig} needs this filter,
     * {@code UserServiceImpl} needs the {@code PasswordEncoder} that {@code SecurityConfig} defines. The proxy defers
     * resolving the service to the first authenticated request. Spelled out by hand, not Lombok, so the annotation
     * is certain to land on the parameter.
     */
    public JwtAuthenticationFilter(JwtDecoder jwtDecoder, @Lazy UserService userService) {
        this.jwtDecoder = jwtDecoder;
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String token = getJwtFromRequest(request);
        if (StringUtils.hasText(token)) {
            authenticate(token, request);
        }

        filterChain.doFilter(request, response);
    }

    private void authenticate(String token, HttpServletRequest request) {
        Jwt jwt;
        try {
            jwt = jwtDecoder.decode(token);
        } catch (BadJwtException e) {
            log.debug("Rejected access token: {}", e.getMessage());
            return;
        } catch (JwtException e) {
            log.error("Could not verify the access token (key set unavailable?)", e);
            request.setAttribute(FAILURE_ATTRIBUTE, HttpStatus.SERVICE_UNAVAILABLE);
            return;
        }

        UUID userId = parseSubject(jwt.getSubject());
        if (userId == null) {
            log.debug("Rejected access token: sub is not a user id");
            return;
        }

        UserAccessState state;
        try {
            state = userService.getAccessState(userId).orElse(null);
        } catch (RuntimeException e) {
            log.error("Could not resolve the account state of user {}", userId, e);
            request.setAttribute(FAILURE_ATTRIBUTE, HttpStatus.INTERNAL_SERVER_ERROR);
            return;
        }
        if (state == null || !state.isActive()) {
            log.debug("Rejected access token: user {} is {}", userId, state == null ? "not provisioned" : "deactivated");
            return;
        }

        List<SimpleGrantedAuthority> authorities = state.roles().stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                .toList();
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(userId.toString(), null, authorities);
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private static UUID parseSubject(String subject) {
        if (!StringUtils.hasText(subject)) {
            return null;
        }
        try {
            return UUID.fromString(subject);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
