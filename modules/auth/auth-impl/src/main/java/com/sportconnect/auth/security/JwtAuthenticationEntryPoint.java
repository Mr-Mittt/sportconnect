package com.sportconnect.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.sportconnect.common.dto.ApiResponse;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Slf4j
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException, ServletException {

        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());

        // A25: the filter could not decide (Keycloak keys unreachable, user lookup failed). That is the server's
        // problem, not a bad credential, so it is not a 401 (the client would drop its session and refresh for nothing).
        Object failure = request.getAttribute(JwtAuthenticationFilter.FAILURE_ATTRIBUTE);
        if (failure instanceof HttpStatus status) {
            boolean unavailable = status == HttpStatus.SERVICE_UNAVAILABLE;
            response.setStatus(status.value());
            mapper.writeValue(response.getOutputStream(), ApiResponse.error(
                    unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
                    unavailable ? "Authentication is temporarily unavailable" : "Could not authenticate the request",
                    null));
            return;
        }

        log.error("Unauthorized error: {}", authException.getMessage());

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        mapper.writeValue(response.getOutputStream(), ApiResponse.error("Unauthorized: " + authException.getMessage()));
    }
}
