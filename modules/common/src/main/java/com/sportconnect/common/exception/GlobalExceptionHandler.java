package com.sportconnect.common.exception;

import com.sportconnect.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
