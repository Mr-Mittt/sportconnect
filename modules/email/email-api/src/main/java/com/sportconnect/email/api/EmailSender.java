package com.sportconnect.email.api;

/**
 * Contract of the email domain: deliver a message the caller has already written. Knows nothing about languages,
 * templates or what the email is for, so a consumer renders its own text and an extraction into a separate service
 * only swaps the transport behind this interface.
 */
public interface EmailSender {

    /**
     * Sends {@code message} without blocking the caller. Fire-and-forget: a delivery failure is logged and never
     * thrown or reported back, so a caller must not depend on the email arriving (and should call this only after
     * its own transaction has committed).
     */
    void send(EmailMessage message);
}
