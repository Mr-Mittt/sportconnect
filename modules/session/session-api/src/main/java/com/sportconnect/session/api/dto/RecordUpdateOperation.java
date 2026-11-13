package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-50: one record to replace in a {@link RecordChangeSetRequest}. Replaces the whole record.
 * If the record was deleted in the meantime it is added again under a new id (reported
 * {@link RecordOperationStatus#RESTORED}): the later request wins.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordUpdateOperation {

    /** The id of the record to replace. */
    private Long id;

    /**
     * Every user named in {@link #data}, for a quick check only: each must be a {@code JOINED}
     * participant of the session. Not stored; the server never reads {@code data} for players.
     */
    private List<UUID> playerIds;

    /** The sport-specific payload. Stored as sent. */
    private Map<String, Object> data;
}
