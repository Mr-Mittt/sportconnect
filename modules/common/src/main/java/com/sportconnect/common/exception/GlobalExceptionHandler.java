package com.sportconnect.common.exception;

import com.sportconnect.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps this app's shared exception types (and Spring's bean-validation failures) to the correct
 * HTTP status, wrapped in {@link ApiResponse}. Before this class existed, every one of these had no
 * {@code @ResponseStatus} anywhere and no handler anywhere, so they all fell through to Spring
 * Boot's default 500 — the business logic correctly decided "this should be a 400/403/401/404," but
 * nothing turned that decision into the right HTTP response. Registered automatically by Spring's
 * component scan (no manual wiring in any module) since {@code @RestControllerAdvice} is
 * meta-annotated {@code @Component} and the app scans all of {@code com.sportconnect}.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(BadRequestException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiResponse<Void>> handleForbidden(ForbiddenException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error(e.getMessage()));
    }

    /**
     * Spring Security's own denial, thrown by {@code @PreAuthorize} when a role or authentication
     * check fails — distinct from this app's {@link ForbiddenException}, which domain code throws
     * for its own authorization rules.
     *
     * <p>Added by A9, which found that without it every {@code @PreAuthorize} denial in the entire
     * application returned <b>500 "An unexpected error occurred"</b> instead of 403: the
     * {@code Exception.class} catch-all below swallowed it before it could reach
     * {@code ExceptionTranslationFilter}, which is what normally turns it into a 403. This had been
     * true of every role-gated endpoint since the catch-all was introduced, and went unnoticed
     * because no integration test had ever exercised a {@code @PreAuthorize} denial — every
     * existing 403 assertion in the suite comes from {@link ForbiddenException} above, which was
     * always mapped correctly.
     *
     * <p>The message is deliberately fixed rather than {@code e.getMessage()}: Spring's text is an
     * internal detail ("Access Denied"/"Access is denied" depending on version), and a caller who
     * lacks permission should not be told which specific expression rejected them.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error("Access denied"));
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnauthorized(UnauthorizedException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler({NotFoundException.class, ResourceNotFoundException.class})
    public ResponseEntity<ApiResponse<Void>> handleNotFound(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
    }

    /**
     * Bean-validation failures from {@code @Valid} request bodies. Field-level messages are
     * collected into a {@code field -> message} map and returned as the response {@code data},
     * since a single top-level message string would lose which field(s) actually failed.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidation(MethodArgumentNotValidException e) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Validation failed", fieldErrors));
    }

    /**
     * A required {@code @RequestParam} (e.g. {@code sportId} on several endpoints across
     * {@code location-impl}) was omitted entirely. Found while verifying LOC-2's
     * {@code GET /api/locations/favorites} against a real running server: a missing required
     * param was falling through to {@link #handleGeneric} (500), even though the controller's own
     * Swagger docs promised 400 — this handler was simply never added when the endpoints that use
     * a required {@code @RequestParam} were written, since only a direct service-layer unit test
     * (never real HTTP request binding) had exercised the "missing param" case before now. Fixes
     * every existing and future endpoint of this shape at once, not just LOC-2's new one.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParameter(MissingServletRequestParameterException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getParameterName() + " is required"));
    }

    /**
     * Catch-all for anything not covered above. Logs the real exception server-side but never
     * leaks its message/stack trace to the client — an uncaught exception is by definition not one
     * the caller can act on, and its message may contain internal details.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("An unexpected error occurred"));
    }
}
