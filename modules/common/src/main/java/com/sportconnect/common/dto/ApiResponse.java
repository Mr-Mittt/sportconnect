package com.sportconnect.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * The envelope every REST response uses.
 *
 * <p>{@code errorCode} and {@code errorParams} (C12) are the machine-readable half of an error:
 * {@code message} stays the English fallback, while the client looks the code up in its own
 * localized copy. Both are omitted from the JSON when {@code null}, so success responses and
 * un-coded errors serialize exactly as they did before C12. See
 * {@code documentation/md/ERROR_HANDLING_DESIGN.md} and {@code ERROR_CODES.md}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {
    
    private boolean success;
    private String message;
    private T data;
    private LocalDateTime timestamp;

    /** Registered {@code <DOMAIN>_<REASON>} error code; {@code null} on success and on un-coded errors. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String errorCode;

    /** Values interpolated into {@code message} (or {@code {fields: {...}}} for validation); {@code null} when none. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> errorParams;
    
    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .message("Success")
                .data(data)
                .timestamp(LocalDateTime.now())
                .build();
    }
    
    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .message(message)
                .data(data)
                .timestamp(LocalDateTime.now())
                .build();
    }
    
    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder()
                .success(false)
                .message(message)
                .data(null)
                .timestamp(LocalDateTime.now())
                .build();
    }
    
    public static <T> ApiResponse<T> error(String message, T data) {
        return ApiResponse.<T>builder()
                .success(false)
                .message(message)
                .data(data)
                .timestamp(LocalDateTime.now())
                .build();
    }

    /**
     * Coded error (C12). {@code errorCode} and {@code errorParams} may each be {@code null}, which
     * makes this identical to {@link #error(String)}.
     */
    public static <T> ApiResponse<T> error(String errorCode, String message, Map<String, Object> errorParams) {
        return ApiResponse.<T>builder()
                .success(false)
                .message(message)
                .errorCode(errorCode)
                .errorParams(errorParams == null || errorParams.isEmpty() ? null : errorParams)
                .timestamp(LocalDateTime.now())
                .build();
    }
}
