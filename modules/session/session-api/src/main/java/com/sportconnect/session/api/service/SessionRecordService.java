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
     * <p>Flow: load the session and gate the caller; require status {@code SCHEDULED}, {@code ONGOING} or
     * {@code COMPLETED} (SESSION-72: a game can be set up before the session starts) and {@code now <= scheduledEndAt + 24h}; require the sport's result schema
     * (its {@code maxRecords} is the per-session record limit, counted with the records already stored; each record's {@code data} is also capped at 4 KB); validate shape and sizes;
     * check every {@code playerIds} entry is {@code JOINED} with one query (the ids are not stored and
     * the server never reads {@code data} for players); apply; return per-operation outcomes and the
     * records as they now are.
     *
     * <p>SESSION-GL-63: when at least one operation was saved (a record added, updated, restored or deleted), the
     * same transaction also writes one {@code SESSION_RECORDS_UPDATED} system comment in the session's thread (naming
     * the caller, authored by the session's creator, without a {@code session.comment.created} event) and one
     * {@code session.record.changed} outbox event, which notifies every {@code JOINED}, {@code REQUESTED} and
     * {@code INVITED} participant except the caller. A change set where nothing was saved (everything rejected or
     * unchanged) writes neither. If the comment cannot be written the whole change set rolls back.
     *
     * @throws com.sportconnect.common.exception.NotFoundException   {@code SESSION_NOT_FOUND}
     * @throws com.sportconnect.common.exception.ForbiddenException  {@code SESSION_RECORD_NOT_ALLOWED}
     * @throws com.sportconnect.common.exception.ConflictException   {@code SESSION_RECORD_NOT_LOGGABLE},
     *         {@code SESSION_RECORD_WINDOW_CLOSED}
     * @throws com.sportconnect.common.exception.BadRequestException {@code SESSION_RECORD_INVALID} (malformed request only)
     */
    RecordChangeSetResponse applyChanges(Long sessionId, UUID callerId, RecordChangeSetRequest request);

    /**
     * SESSION-72: proposes a record as a ranking game. Only a {@code JOINED} participant of the session; the session must
     * be {@code SCHEDULED}, {@code ONGOING} or {@code COMPLETED} and no later than 24 hours after it ended; the sport's
     * schema must let its records be ranked and the record must be valid and either rankable or a planned game with no
     * score yet. Sets the proposal on the record (a second proposal changes nothing and notifies nobody), confirms it for
     * the proposer when they are a named player and the game is already rankable, and tells every other active player
     * named in it with one {@code session.record.verification_requested} event each, in the same transaction.
     *
     * <p>Flow: gate, status and window, the proposer's participation, the sport's schema and reader, then the record's
     * row lock and the rules above.
     *
     * @return the record as it now stands, with its {@code ranking} state
     * @throws com.sportconnect.common.exception.NotFoundException   {@code SESSION_NOT_FOUND}, {@code SESSION_RECORD_NOT_FOUND}
     * @throws com.sportconnect.common.exception.ForbiddenException  {@code SESSION_RECORD_NOT_ALLOWED},
     *         {@code SESSION_RECORD_RANKING_PROPOSER_NOT_JOINED}
     * @throws com.sportconnect.common.exception.ConflictException   {@code SESSION_RECORD_NOT_LOGGABLE},
     *         {@code SESSION_RECORD_WINDOW_CLOSED}, {@code SESSION_RECORD_RANKING_NOT_AVAILABLE},
     *         {@code SESSION_RECORD_RANKING_NOT_RANKABLE} (with {@code errorParams.reason})
     */
    SessionRecordDto requestRanking(Long sessionId, Long recordId, UUID callerId);

    /**
     * SESSION-72: a player named in a proposed record confirms its current content. Same gate, status and window as the
     * proposal; the caller must be named in the record, the record must be proposed and rankable (a complete score with
     * the first team ahead: a planned game cannot be confirmed). Takes the record's row lock, so it cannot interleave
     * with an edit; the confirmation is stored against the record's current revision, and confirming again does
     * nothing. A confirmation of an older revision never counts, even without the lock.
     *
     * @return the record as it now stands, with its {@code ranking} state
     * @throws com.sportconnect.common.exception.NotFoundException   {@code SESSION_NOT_FOUND}, {@code SESSION_RECORD_NOT_FOUND}
     * @throws com.sportconnect.common.exception.ForbiddenException  {@code SESSION_RECORD_NOT_ALLOWED},
     *         {@code SESSION_RECORD_VERIFY_NOT_A_PLAYER}
     * @throws com.sportconnect.common.exception.ConflictException   {@code SESSION_RECORD_NOT_LOGGABLE},
     *         {@code SESSION_RECORD_WINDOW_CLOSED}, {@code SESSION_RECORD_RANKING_NOT_AVAILABLE},
     *         {@code SESSION_RECORD_NOT_PROPOSED}, {@code SESSION_RECORD_RANKING_NOT_RANKABLE}
     */
    SessionRecordDto verify(Long sessionId, Long recordId, UUID callerId);
}
