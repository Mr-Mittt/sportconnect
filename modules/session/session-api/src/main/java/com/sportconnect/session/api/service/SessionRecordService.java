package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.RecordChangeSetRequest;
import com.sportconnect.session.api.dto.RecordChangeSetResponse;
import com.sportconnect.session.api.dto.SessionRecordDto;

import java.util.List;
import java.util.UUID;

/**
 * SESSION-50: the results (games) recorded in a session. The server stores each record as the client
 * sent it and checks only access, the session's status and window, that the named players joined, and
 * size and count limits; the sport's result schema drives everything else on the client.
 *
 * <p>Access: in a group session any active group member, in a standalone session any {@code JOINED}
 * participant, may read, add, change and delete any record.
 */
public interface SessionRecordService {

    /**
     * All records of a session, oldest first.
     *
     * @throws com.sportconnect.common.exception.NotFoundException  {@code SESSION_NOT_FOUND}
     * @throws com.sportconnect.common.exception.ForbiddenException {@code SESSION_RECORD_NOT_ALLOWED}
     */
    List<SessionRecordDto> getRecords(Long sessionId, UUID callerId);

    /**
     * Applies a change set in one transaction: adds, updates and deletes. Concurrency never errors:
     * first come first served, the later request wins, an update of a deleted record restores it as a
     * new record, a delete of a gone record does nothing. A bad record (invalid, too large,
     * a player who has not joined, or past {@code maxRecords}) is refused alone with status {@code REJECTED}
     * and its error code, and the valid operations are still applied; a malformed request (a missing or
     * repeated ref or id, over 50 operations) is refused whole.
     *
     * <p>Flow: load the session and gate the caller; require status {@code ONGOING} or
     * {@code COMPLETED} and {@code now <= scheduledEndAt + 24h}; require the sport's result schema
     * (its {@code maxRecords} is the per-session record limit, counted with the records already stored; each record's {@code data} is also capped at 4 KB); validate shape and sizes;
     * check every {@code playerIds} entry is {@code JOINED} with one query (the ids are not stored and
     * the server never reads {@code data} for players); apply; return per-operation outcomes and the
     * records as they now are.
     *
     * @throws com.sportconnect.common.exception.NotFoundException   {@code SESSION_NOT_FOUND}
     * @throws com.sportconnect.common.exception.ForbiddenException  {@code SESSION_RECORD_NOT_ALLOWED}
     * @throws com.sportconnect.common.exception.ConflictException   {@code SESSION_RECORD_NOT_LOGGABLE},
     *         {@code SESSION_RECORD_WINDOW_CLOSED}
     * @throws com.sportconnect.common.exception.BadRequestException {@code SESSION_RECORD_INVALID} (malformed request only)
     */
    RecordChangeSetResponse applyChanges(Long sessionId, UUID callerId, RecordChangeSetRequest request);
}
