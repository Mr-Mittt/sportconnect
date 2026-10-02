package com.sportconnect.common.exception;

import java.util.Map;

public class ResourceNotFoundException extends RuntimeException implements CodedException {

    private final String errorCode;
    private final Map<String, Object> errorParams;

    public ResourceNotFoundException(String message) {
        this(message, null, null, true);
    }

    public ResourceNotFoundException(String resourceName, String fieldName, Object fieldValue) {
        this(String.format("%s not found with %s: '%s'", resourceName, fieldName, fieldValue), null, null, true);
    }

    private ResourceNotFoundException(String message, String errorCode, Map<String, Object> errorParams, boolean unused) {
        super(message);
        this.errorCode = errorCode;
        this.errorParams = errorParams;
    }

    /**
     * Coded variant (C12). A static factory rather than a {@code (String, String, Map)} constructor
     * because that would overload the existing {@code (String, String, Object)} constructor, and a
     * {@code null} third argument would silently pick the wrong one.
     *
     * @param errorCode   registered {@code <DOMAIN>_<REASON>} code, see {@code ERROR_CODES.md}
     * @param message     English fallback text
     * @param errorParams values interpolated into the message; may be {@code null}
     */
    public static ResourceNotFoundException coded(String errorCode, String message, Map<String, Object> errorParams) {
        return new ResourceNotFoundException(message, errorCode, errorParams, true);
    }

    @Override
    public String getErrorCode() {
        return errorCode;
    }

    @Override
    public Map<String, Object> getErrorParams() {
        return errorParams;
    }
}
