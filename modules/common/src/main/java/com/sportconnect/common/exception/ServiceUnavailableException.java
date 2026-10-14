package com.sportconnect.common.exception;

import java.util.Map;

/**
 * A dependency this request cannot do without (Keycloak, or the store behind a short-lived ticket) is not answering, so
 * the request was neither done nor refused on its merits and may be retried. Mapped to HTTP 503 by
 * {@link GlobalExceptionHandler}; the client treats it like the framework's own 503 ({@code SERVICE_UNAVAILABLE}).
 * Added by A26.
 */
public class ServiceUnavailableException extends RuntimeException implements CodedException {

    public static final String CODE = "SERVICE_UNAVAILABLE";

    public ServiceUnavailableException(String message) {
        super(message);
    }

    public ServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    @Override
    public String getErrorCode() {
        return CODE;
    }

    @Override
    public Map<String, Object> getErrorParams() {
        return null;
    }
}
