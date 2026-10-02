package com.sportconnect.common.exception;

import com.sportconnect.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps this app's shared exception types <em>and</em> every standard Spring MVC framework exception
 * to the correct HTTP status, wrapped in {@link ApiResponse}.
 *
 * <p>Two layers:
 * <ul>
 *   <li><strong>Our own exceptions</strong> ({@link BadRequestException}, {@link ForbiddenException},
 *       {@link UnauthorizedException}, {@link NotFoundException}/{@link ResourceNotFoundException})
 *       and Spring Security's {@link AccessDeniedException} — explicit {@code @ExceptionHandler}
 *       methods below. Before C1 added them, each had no {@code @ResponseStatus} and no handler, so
 *       all fell through to Spring Boot's default 500.</li>
 *   <li><strong>Spring MVC framework exceptions</strong> (no handler for the path &rarr; 404, wrong
 *       method &rarr; 405, unreadable body &rarr; 400, and the rest) — inherited from
 *       {@link ResponseEntityExceptionHandler}, which C4 made this class extend. Before C4, the
 *       {@code @ExceptionHandler(Exception.class)} catch-all swallowed all of them into a generic
 *       500; C1 had already had to hand-patch {@code MethodArgumentNotValidException} and
 *       {@code MissingServletRequestParameterException} back one at a time as they were noticed.
 *       {@link #handleExceptionInternal} re-wraps the base class's {@code ProblemDetail} body in
 *       {@link ApiResponse} so every response in the app keeps one envelope.</li>
 * </ul>
 *
 * <p>Registered automatically by Spring's component scan (no manual wiring in any module) since
 * {@code @RestControllerAdvice} is meta-annotated {@code @Component} and the app scans all of
 * {@code com.sportconnect}.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(BadRequestException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(coded(e));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiResponse<Void>> handleForbidden(ForbiddenException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(coded(e));
    }

    /**
     * 409: well-formed request that clashes with current state. Added by C12; no pre-existing site
     * throws it yet (each module's error-code audit moves its own sites from 400 where it applies).
     */
    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiResponse<Void>> handleConflict(ConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(coded(e));
    }

    /**
     * Builds the error body for one of our shared exceptions, copying its {@code errorCode} /
     * {@code errorParams} when it carries them (C12). An un-coded exception yields exactly the
     * {@code message}-only body it always did.
     */
    private static <E extends RuntimeException & CodedException> ApiResponse<Void> coded(E e) {
        return ApiResponse.error(e.getErrorCode(), e.getMessage(), e.getErrorParams());
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
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("ACCESS_DENIED", "Access denied", null));
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnauthorized(UnauthorizedException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(coded(e));
    }

    @ExceptionHandler({NotFoundException.class, ResourceNotFoundException.class})
    public ResponseEntity<ApiResponse<Void>> handleNotFound(RuntimeException e) {
        String code = e instanceof CodedException coded ? coded.getErrorCode() : null;
        Map<String, Object> params = e instanceof CodedException coded ? coded.getErrorParams() : null;
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(code, e.getMessage(), params));
    }

    /**
     * Bean-validation failures from {@code @Valid} request bodies. Field-level messages are
     * collected into a {@code field -> message} map and returned as
     * {@code errorParams.fields} (code {@code VALIDATION_FAILED}), since a single top-level message
     * string would lose which field(s) actually failed. C12 moved the map out of {@code data}, which
     * is now always {@code null} on an error.
     *
     * <p>An {@code @Override} of {@link ResponseEntityExceptionHandler}'s own handler rather than a
     * fresh {@code @ExceptionHandler(MethodArgumentNotValidException.class)} method: declaring the
     * latter while inheriting the base mapping for the same type makes Spring throw
     * "Ambiguous @ExceptionHandler method mapped" at startup. Overriding adds no new mapping — the
     * inherited {@code handleException} dispatches here polymorphically. The {@link ApiResponse}
     * body built here is passed through untouched by {@link #handleExceptionInternal}.
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        Map<String, Object> params = fieldErrors.isEmpty() ? null : Map.of("fields", fieldErrors);
        return handleExceptionInternal(ex, ApiResponse.error("VALIDATION_FAILED", "Validation failed", params),
                headers, HttpStatus.BAD_REQUEST, request);
    }

    /**
     * A required {@code @RequestParam} (e.g. {@code sportId} on several endpoints across
     * {@code location-impl}) was omitted entirely. Found while verifying LOC-2's
     * {@code GET /api/locations/favorites} against a real running server: a missing required
     * param was falling through to {@link #handleGeneric} (500), even though the controller's own
     * Swagger docs promised 400. Same {@code @Override}-not-{@code @ExceptionHandler} reasoning as
     * {@link #handleMethodArgumentNotValid}.
     */
    @Override
    protected ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return handleExceptionInternal(ex, ApiResponse.error("MISSING_PARAMETER", ex.getParameterName() + " is required",
                        Map.of("param", ex.getParameterName())),
                headers, HttpStatus.BAD_REQUEST, request);
    }

    /**
     * The single funnel every {@link ResponseEntityExceptionHandler} handler routes through. Swaps
     * the base class's RFC-7807 {@code ProblemDetail} (or {@code null}) body for this app's
     * {@link ApiResponse} envelope, so a misrouted / malformed request gets the same
     * {@code {success:false, message, data:null}} shape as every other error response.
     *
     * <p>A {@code body} that is already an {@link ApiResponse} (built by
     * {@link #handleMethodArgumentNotValid} / {@link #handleMissingServletRequestParameter}) is
     * passed through unchanged. Everything else gets a fixed per-status message via
     * {@link #genericMessageFor} — never {@code ex.getMessage()}, which for these framework
     * exceptions can carry the offending path, header value, or JSON-parser internals.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        if (statusCode.is5xxServerError()) {
            log.error("Unhandled Spring MVC exception ({})", statusCode, ex);
        }
        Object envelope = (body instanceof ApiResponse<?>)
                ? body
                : ApiResponse.error(genericCodeFor(statusCode), genericMessageFor(statusCode), null);
        return super.handleExceptionInternal(ex, envelope, headers, statusCode, request);
    }

    /**
     * Fixed per-status error code for framework-level failures (C12), registered in
     * {@code ERROR_CODES.md}. Statuses without a dedicated code return {@code null} (message only).
     */
    private static String genericCodeFor(HttpStatusCode statusCode) {
        return switch (statusCode.value()) {
            case 400 -> "MALFORMED_REQUEST";
            case 404 -> "ENDPOINT_NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 413 -> "REQUEST_TOO_LARGE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            case 503 -> "SERVICE_UNAVAILABLE";
            default -> statusCode.is5xxServerError() ? "INTERNAL_ERROR" : null;
        };
    }

    private static String genericMessageFor(HttpStatusCode statusCode) {
        return switch (statusCode.value()) {
            case 400 -> "Malformed request";
            case 404 -> "Resource not found";
            case 405 -> "Request method not supported";
            case 406 -> "Not acceptable";
            case 413 -> "Request too large";
            case 415 -> "Unsupported media type";
            case 503 -> "Service temporarily unavailable";
            default -> statusCode.is5xxServerError()
                    ? "An unexpected error occurred"
                    : HttpStatus.valueOf(statusCode.value()).getReasonPhrase();
        };
    }

    /**
     * Catch-all for anything not covered above or by {@link ResponseEntityExceptionHandler} — an
     * exception thrown by application code that isn't one of our shared types and isn't a Spring
     * MVC framework exception. Logs the real exception server-side but never leaks its
     * message/stack trace to the client.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("INTERNAL_ERROR", "An unexpected error occurred", null));
    }
}
