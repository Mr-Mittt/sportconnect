package com.sportconnect.common.exception;

import java.util.Map;

public class BadRequestException extends RuntimeException implements CodedException {

    private final String errorCode;
    private final Map<String, Object> errorParams;

    public BadRequestException(String message) {
        this(null, message, null);
    }

    /**
     * Coded variant (C12). {@code message} remains the English fallback shown by un-upgraded clients.
     *
     * @param errorCode   registered {@code <DOMAIN>_<REASON>} code, see {@code ERROR_CODES.md}
     * @param message     English fallback text
     * @param errorParams values interpolated into the message; may be {@code null}
     */
    public BadRequestException(String errorCode, String message, Map<String, Object> errorParams) {
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
