package com.sportconnect.session.record;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * SESSION-50: caps the body of {@code POST /api/sessions/{id}/records/changes} at 64 KB before any
 * JSON is parsed, so an oversized or deeply nested body cannot be used against the parser. The app
 * has no other request-size limit (only a 10 MB multipart one). A declared {@code Content-Length}
 * over the cap is refused with 413 {@code SESSION_RECORD_TOO_LARGE}; a body with no declared length
 * (chunked) is cut off by a counting stream the moment it passes the cap, which surfaces as a 400
 * from the message converter.
 */
@Component
@RequiredArgsConstructor
public class RecordRequestSizeFilter extends OncePerRequestFilter {

    /** The most bytes a change-set request body may have. */
    static final int MAX_BODY_BYTES = 64 * 1024;

    private static final String PATTERN = "/api/sessions/*/records/changes";
    private final AntPathMatcher matcher = new AntPathMatcher();
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !HttpMethod.POST.matches(request.getMethod()) || !matcher.match(PATTERN, request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long declared = request.getContentLengthLong();
        if (declared > MAX_BODY_BYTES) {
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getOutputStream(), ApiResponse.<Void>builder()
                    .success(false)
                    .message("The request is too large")
                    .timestamp(LocalDateTime.now())
                    .errorCode("SESSION_RECORD_TOO_LARGE")
                    .errorParams(Map.of("maxBytes", MAX_BODY_BYTES))
                    .build());
            return;
        }
        chain.doFilter(declared >= 0 ? request : new LimitedRequest(request), response);
    }

    /** Wraps a body of unknown length so reading past the cap fails instead of buffering without limit. */
    private static final class LimitedRequest extends HttpServletRequestWrapper {

        LimitedRequest(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream delegate = super.getInputStream();
            return new ServletInputStream() {
                private long count;

                @Override
                public int read() throws IOException {
                    int b = delegate.read();
                    if (b >= 0 && ++count > MAX_BODY_BYTES) {
                        throw new IOException("Request body exceeds " + MAX_BODY_BYTES + " bytes");
                    }
                    return b;
                }

                @Override
                public int read(byte[] buffer, int off, int len) throws IOException {
                    int n = delegate.read(buffer, off, len);
                    if (n > 0 && (count += n) > MAX_BODY_BYTES) {
                        throw new IOException("Request body exceeds " + MAX_BODY_BYTES + " bytes");
                    }
                    return n;
                }

                @Override
                public boolean isFinished() {
                    return delegate.isFinished();
                }

                @Override
                public boolean isReady() {
                    return delegate.isReady();
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    delegate.setReadListener(listener);
                }
            };
        }
    }
}
