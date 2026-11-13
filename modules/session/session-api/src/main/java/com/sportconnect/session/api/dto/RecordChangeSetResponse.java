package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * SESSION-50: the outcome of a change set, with the session's records as they are after it, so the
 * client reconciles with other players' changes made while its dialog was open.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordChangeSetResponse {

    /** One entry per operation: adds first, then updates, then deletes, in request order. */
    private List<RecordOperationResult> results;

    /** All records of the session, oldest first. */
    private List<SessionRecordDto> records;
}
