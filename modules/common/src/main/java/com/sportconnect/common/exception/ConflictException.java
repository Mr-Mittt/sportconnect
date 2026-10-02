package com.sportconnect.common.exception;

import java.util.Map;

/**
 * The request is well-formed but clashes with the current state of a resource (for example a
 * duplicate that already exists). Mapped to HTTP 409 by {@link GlobalExceptionHandler}; the client
 * treats it as the {@code CONFLICT} category. Added by C12 with no existing throw site converted —
 * moving a site from {@link BadRequestException} to this is a status change, so each module's
 * error-code audit decides that per site.
 */
public class ConflictException extends RuntimeException implements CodedException {

    private final String errorCode;
    private final Map<String, Object> errorParams;

    public ConflictException(String message) {
        this(null, message, null);
    }

    /**
     * Coded variant (C12). {@code message} remains the English fallback shown by un-upgraded clients.
     *
     * @param errorCode   registered {@code <DOMAIN>_<REASON>} code, see {@code ERROR_CODES.md}
     * @param message     English fallback text
     * @param errorParams values interpolated into the message; may be {@code null}
     */
    public ConflictException(String errorCode, String message, Map<String, Object> errorParams) {
        super(message);
        this.errorCode = errorCode;
        this.errorParams = errorParams;
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
