package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-50: one record to add in a {@link RecordChangeSetRequest}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordAddOperation {

    /**
     * Client-generated id of this add. Stored with the row, so a retried request (the first attempt
     * may have succeeded) returns the existing record instead of creating a second one, and the
     * response maps it back to the database id.
     */
    private UUID clientRef;

    /**
     * Every user named in {@link #data}, for a quick check only: each must be a {@code JOINED}
     * participant of the session. Not stored; the server never reads {@code data} for players.
     */
    private List<UUID> playerIds;

    /** The sport-specific payload (sides, winner, ...). Stored as sent; its shape is the client's. */
    private Map<String, Object> data;
}
