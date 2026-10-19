package com.sportconnect.common.exception;

import java.util.Map;

/**
 * The caller has used up an allowance (wrong password attempts, a code resent too soon) and must wait before trying
 * again. Nothing was changed. Mapped to HTTP 429 by {@link GlobalExceptionHandler}; the coded variant carries the wait
 * in {@code errorParams} (for example {@code {seconds: 42}}) for the client's own copy. Added by U24.
 */
public class TooManyRequestsException extends RuntimeException implements CodedException {

    private final String errorCode;
    private final Map<String, Object> errorParams;

    public TooManyRequestsException(String errorCode, String message, Map<String, Object> errorParams) {
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
