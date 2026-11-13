package com.sportconnect.session.api.dto;

/**
 * SESSION-50: what happened to one operation of a change set. Concurrency never produces an error,
 * so a request that finds its target already changed ends in one of these.
 */
public enum RecordOperationStatus {
    /** A new record was stored. */
    CREATED,
    /** An existing record was replaced. */
    UPDATED,
    /** The record to update had been deleted; it was stored again under a new id. */
    RESTORED,
    /** The record was deleted. */
    DELETED,
    /** Nothing changed: an add that was already stored (same client ref), or a delete of a record already gone. */
    UNCHANGED,
    /**
     * This one operation was refused and nothing was stored for it; the others of the change set were
     * applied. The result carries {@code errorCode} and {@code errorParams}.
     */
    REJECTED
}
