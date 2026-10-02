package com.sportconnect.common.exception;

import java.util.Map;

/**
 * Implemented by the shared exceptions that can carry a machine-readable error code (C12), so
 * {@link GlobalExceptionHandler} can copy it onto the response without caring which concrete type
 * was thrown. Both accessors are nullable: an exception built with only a message is un-coded and
 * produces the same response it always did.
 *
 * <p>The code is {@code <DOMAIN>_<REASON>} upper snake case and must be registered in
 * {@code documentation/md/ERROR_CODES.md}. {@code errorParams} carries the values interpolated into
 * the English message (for example {@code {min: 50, max: 300}}) so the client can interpolate them
 * into its own localized copy.
 */
public interface CodedException {

    /** The registered error code, or {@code null} when this exception is un-coded. */
    String getErrorCode();

    /** Values interpolated into the message, or {@code null} when there are none. */
    Map<String, Object> getErrorParams();
}
