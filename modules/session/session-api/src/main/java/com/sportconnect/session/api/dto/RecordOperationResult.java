package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.UUID;

/**
 * SESSION-50: the outcome of one operation of a change set.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordOperationResult {

    /** The client ref of an add; {@code null} for an update or delete. */
    private UUID clientRef;

    /** The id the operation was asked to change; {@code null} for an add. */
    private Long requestedId;

    /**
     * The id of the resulting record: the new id for an add or a restore, the same id otherwise;
     * {@code null} for a delete.
     */
    private Long id;

    private RecordOperationStatus status;

    /**
     * Set only when {@code status} is {@code REJECTED}: {@code SESSION_RECORD_INVALID},
     * {@code SESSION_RECORD_TOO_LARGE}, {@code SESSION_RECORD_PLAYER_NOT_JOINED} or
     * {@code SESSION_RECORD_LIMIT_REACHED}.
     */
    private String errorCode;

    /** Parameters of the error ({@code maxBytes}, {@code maxRecords}); {@code null} when it has none. */
    private Map<String, Object> errorParams;
}
