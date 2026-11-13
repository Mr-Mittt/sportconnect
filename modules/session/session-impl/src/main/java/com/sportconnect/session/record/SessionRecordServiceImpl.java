package com.sportconnect.session.record;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RecordAddOperation;
import com.sportconnect.session.api.dto.RecordChangeSetRequest;
import com.sportconnect.session.api.dto.RecordChangeSetResponse;
import com.sportconnect.session.api.dto.RecordOperationResult;
import com.sportconnect.session.api.dto.RecordOperationStatus;
import com.sportconnect.session.api.dto.RecordUpdateOperation;
import com.sportconnect.session.api.dto.SessionRecordDto;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.service.SessionRecordService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * SESSION-50: stores and serves a session's result records. See {@link SessionRecordService} for the
 * contract and {@code modules/session/docs/SESSION_RECORDS_DESIGN.md} for the design.
 *
 * <p>Concurrency: every write touches single rows. An add is a plain insert (the database identity
 * hands out distinct ids, so concurrent adds never contend). An update or delete locks only the rows
 * it changes, in id order. A request that finds its target already changed never fails: an update of
 * a deleted record stores it again under a new id, a delete of a missing record does nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionRecordServiceImpl implements SessionRecordService {

    /** Most operations (adds + updates + deletes) in one change set. */
    static final int MAX_OPERATIONS = 50;
    static final int DEFAULT_MAX_RECORDS = 100;
    static final int CEILING_MAX_RECORDS = 500;
    /** Most bytes of one record's serialized {@code data}: the same 4 KB cap as sport profile and session attributes. */
    static final int MAX_RECORD_BYTES = 4096;
    /** Most users one record may name. */
    static final int MAX_PLAYERS = 50;
    /** Deepest nesting allowed in a record's {@code data} (the object itself is level 1). */
    static final int MAX_DEPTH = 10;
    /** How long after the session's end its records can still be added, changed or deleted. */
    static final Duration EDIT_WINDOW = Duration.ofHours(24);

    private final SessionRepository sessionRepository;
    private final SessionRecordRepository recordRepository;
    private final SessionParticipantRepository participantRepository;
    private final SessionRecordGate gate;
    private final SportService sportService;
    private final ObjectMapper objectMapper;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    /** A record about to be inserted, with the result waiting for its new id. */
    private record Pending(RecordOperationResult result, SessionRecord record) {
    }

    /** {@inheritDoc} */
    @Override
    @Transactional(readOnly = true)
    public List<SessionRecordDto> getRecords(Long sessionId, UUID callerId) {
        requireAccess(sessionId, callerId);
        return toDtos(recordRepository.findBySessionIdOrderByIdAsc(sessionId));
    }

    /**
     * {@inheritDoc}
     *
     * <p>Order of work: gate and status/window checks first, then the request shape (a malformed request
     * is refused whole), then each record's own checks (a bad record becomes a {@code REJECTED} result and
     * the rest go on), the row locks, the in-memory plan, the limit (only the new records that still fit
     * are stored) and finally the writes. A runtime exception anywhere rolls the whole change set back.
     */
    @Override
    @Transactional
    public RecordChangeSetResponse applyChanges(Long sessionId, UUID callerId, RecordChangeSetRequest request) {
        Session session = requireAccess(sessionId, callerId);
        Instant now = clock.instant();
        requireLoggable(session, now);
        int maxRecords = maxRecordsFor(session.getSportId());

        List<RecordAddOperation> adds = orEmpty(request == null ? null : request.getAdd());
        List<RecordUpdateOperation> updates = orEmpty(request == null ? null : request.getUpdate());
        List<Long> deletes = orEmpty(request == null ? null : request.getDelete());
        if (adds.size() + updates.size() + deletes.size() > MAX_OPERATIONS) {
            throw invalid("A change set may have at most " + MAX_OPERATIONS + " operations");
        }

        // A malformed request (a missing or repeated ref or id) is refused whole: it is a client bug,
        // not a bad record.
        Set<UUID> clientRefs = new HashSet<>();
        for (RecordAddOperation add : adds) {
            if (add == null || add.getClientRef() == null || !clientRefs.add(add.getClientRef())) {
                throw invalid("Every added record needs its own clientRef");
            }
        }
        Set<Long> updateIds = new HashSet<>();
        for (RecordUpdateOperation update : updates) {
            if (update == null || update.getId() == null || !updateIds.add(update.getId())) {
                throw invalid("Every updated record needs its own id");
            }
        }
        Set<Long> deleteIds = new LinkedHashSet<>();
        for (Long id : deletes) {
            if (id == null) {
                throw invalid("A deleted record needs an id");
            }
            deleteIds.add(id);
        }

        // One bad record is refused alone; the valid ones are still applied. Shape first, then one
        // query for the players of the records that passed.
        List<Rejection> addRejections = new ArrayList<>();
        List<Rejection> updateRejections = new ArrayList<>();
        Set<UUID> named = new LinkedHashSet<>();
        for (RecordAddOperation add : adds) {
            Rejection rejection = checkRecord(add.getPlayerIds(), add.getData());
            addRejections.add(rejection);
            if (rejection == null) {
                named.addAll(add.getPlayerIds());
            }
        }
        for (RecordUpdateOperation update : updates) {
            Rejection rejection = checkRecord(update.getPlayerIds(), update.getData());
            updateRejections.add(rejection);
            if (rejection == null) {
                named.addAll(update.getPlayerIds());
            }
        }
        Set<UUID> joined = joinedAmong(sessionId, named);
        for (int i = 0; i < adds.size(); i++) {
            if (addRejections.get(i) == null && !joined.containsAll(adds.get(i).getPlayerIds())) {
                addRejections.set(i, NOT_JOINED);
            }
        }
        for (int i = 0; i < updates.size(); i++) {
            if (updateRejections.get(i) == null && !joined.containsAll(updates.get(i).getPlayerIds())) {
                updateRejections.set(i, NOT_JOINED);
            }
        }

        Set<Long> lockIds = new HashSet<>(deleteIds);
        for (int i = 0; i < updates.size(); i++) {
            if (updateRejections.get(i) == null) {
                lockIds.add(updates.get(i).getId());
            }
        }
        Map<Long, SessionRecord> existing = lockIds.isEmpty() ? Map.of()
                : recordRepository.findForUpdate(sessionId, lockIds).stream()
                        .collect(Collectors.toMap(SessionRecord::getId, Function.identity()));
        Map<UUID, SessionRecord> replays = clientRefs.isEmpty() ? Map.of()
                : recordRepository.findBySessionIdAndClientRequestIdIn(sessionId, clientRefs).stream()
                        .collect(Collectors.toMap(SessionRecord::getClientRequestId, Function.identity()));

        List<RecordOperationResult> results = new ArrayList<>();
        List<Pending> pending = new ArrayList<>();
        List<SessionRecord> toDelete = new ArrayList<>();

        for (int i = 0; i < adds.size(); i++) {
            RecordAddOperation add = adds.get(i);
            if (addRejections.get(i) != null) {
                results.add(rejected(add.getClientRef(), null, addRejections.get(i)));
                continue;
            }
            SessionRecord replay = replays.get(add.getClientRef());
            if (replay != null) {
                results.add(result(add.getClientRef(), null, replay.getId(), RecordOperationStatus.UNCHANGED));
                continue;
            }
            RecordOperationResult result = result(add.getClientRef(), null, null, RecordOperationStatus.CREATED);
            results.add(result);
            pending.add(new Pending(result,
                    newRecord(sessionId, add.getClientRef(), add.getData(), callerId, now)));
        }
        for (int i = 0; i < updates.size(); i++) {
            RecordUpdateOperation update = updates.get(i);
            if (updateRejections.get(i) != null) {
                results.add(rejected(null, update.getId(), updateRejections.get(i)));
                continue;
            }
            if (deleteIds.contains(update.getId())) {
                // Delete wins within one change set; the delete below reports DELETED.
                results.add(result(null, update.getId(), null, RecordOperationStatus.UNCHANGED));
                continue;
            }
            SessionRecord row = existing.get(update.getId());
            if (row == null) {
                RecordOperationResult result = result(null, update.getId(), null, RecordOperationStatus.RESTORED);
                results.add(result);
                pending.add(new Pending(result,
                        newRecord(sessionId, UUID.randomUUID(), update.getData(), callerId, now)));
                continue;
            }
            row.setData(new LinkedHashMap<>(update.getData()));
            row.setUpdatedBy(callerId);
            row.setUpdatedAt(now);
            results.add(result(null, update.getId(), row.getId(), RecordOperationStatus.UPDATED));
        }
        for (Long id : deleteIds) {
            SessionRecord row = existing.get(id);
            if (row == null) {
                results.add(result(null, id, null, RecordOperationStatus.UNCHANGED));
                continue;
            }
            toDelete.add(row);
            results.add(result(null, id, null, RecordOperationStatus.DELETED));
        }

        // The sport's maxRecords counts the stored records: only as many new records as still fit are
        // stored (in request order, adds before restores); the rest are refused one by one.
        if (!pending.isEmpty()) {
            long room = maxRecords - (recordRepository.countBySessionId(sessionId) - toDelete.size());
            if (pending.size() > room) {
                int keep = (int) Math.max(0, room);
                Rejection full = new Rejection("SESSION_RECORD_LIMIT_REACHED", Map.of("maxRecords", maxRecords));
                for (Pending p : pending.subList(keep, pending.size())) {
                    markRejected(p.result(), full);
                }
                pending = new ArrayList<>(pending.subList(0, keep));
            }
        }

        recordRepository.deleteAll(toDelete);
        List<SessionRecord> saved = recordRepository.saveAll(pending.stream().map(Pending::record).toList());
        for (int i = 0; i < pending.size(); i++) {
            Pending p = pending.get(i);
            SessionRecord record = saved.get(i);
            p.result().setId(record.getId());
        }

        long refused = results.stream().filter(r -> r.getStatus() == RecordOperationStatus.REJECTED).count();
        log.info("Session {} records changed by {}: {} adds, {} updates, {} deletes, {} rejected",
                sessionId, callerId, adds.size(), updates.size(), deleteIds.size(), refused);
        return RecordChangeSetResponse.builder()
                .results(results)
                .records(toDtos(recordRepository.findBySessionIdOrderByIdAsc(sessionId)))
                .build();
    }

    /** Availability (404 {@code SESSION_NOT_FOUND}) before visibility (403 {@code SESSION_RECORD_NOT_ALLOWED}). */
    private Session requireAccess(Long sessionId, UUID callerId) {
        Session session = sessionRepository.findById(sessionId).orElse(null);
        return gate.require(session, callerId,
                "SESSION_NOT_FOUND", "Session not found",
                "SESSION_RECORD_NOT_ALLOWED", "You don't have access to this session's results");
    }

    /** Status {@code ONGOING}/{@code COMPLETED} and no later than 24 hours after {@code scheduledEndAt}. */
    private void requireLoggable(Session session, Instant now) {
        SessionStatus status = session.getStatus();
        if ((status != SessionStatus.ONGOING && status != SessionStatus.COMPLETED)
                || session.getScheduledEndAt() == null) {
            throw new ConflictException("SESSION_RECORD_NOT_LOGGABLE",
                    "Results can only be recorded in an ongoing or completed session", null);
        }
        if (now.isAfter(session.getScheduledEndAt().plus(EDIT_WINDOW))) {
            throw new ConflictException("SESSION_RECORD_WINDOW_CLOSED",
                    "Results can no longer be changed 24 hours after the session ended", null);
        }
    }

    /**
     * The sport's {@code maxRecords} (records one session may hold) from its result schema: default 100 if
     * absent, clamped to 500. A sport without a result schema (or an inactive one) has no result logging.
     */
    private int maxRecordsFor(Long sportId) {
        Map<String, Object> schema;
        try {
            schema = sportService.getResultSchema(sportId);
        } catch (ResourceNotFoundException e) {
            schema = null;
        }
        if (schema == null) {
            throw new ConflictException("SESSION_RECORD_NOT_LOGGABLE",
                    "Results cannot be recorded for this sport", null);
        }
        return clampedInt(schema.get("maxRecords"), DEFAULT_MAX_RECORDS, CEILING_MAX_RECORDS);
    }

    private static int clampedInt(Object value, int defaultValue, int ceiling) {
        if (!(value instanceof Number number) || number.intValue() < 1) {
            return defaultValue;
        }
        return Math.min(number.intValue(), ceiling);
    }

    /** Player ids (checked, not stored): non-empty, distinct, at most {@value #MAX_PLAYERS}. Data: an object, shallow enough and small enough. */
    private Rejection checkRecord(List<UUID> players, Map<String, Object> data) {
        if (players == null || players.isEmpty() || players.size() > MAX_PLAYERS
                || players.contains(null) || new HashSet<>(players).size() != players.size()) {
            return INVALID;
        }
        if (data == null || tooDeep(data, 1)) {
            return INVALID;
        }
        int bytes;
        try {
            bytes = objectMapper.writeValueAsBytes(data).length;
        } catch (JsonProcessingException e) {
            return INVALID;
        }
        return bytes > MAX_RECORD_BYTES
                ? new Rejection("SESSION_RECORD_TOO_LARGE", Map.of("maxBytes", MAX_RECORD_BYTES))
                : null;
    }

    /** Why one operation was refused; the rest of its change set is still applied. */
    private record Rejection(String code, Map<String, Object> params) {
    }

    private static final Rejection INVALID = new Rejection("SESSION_RECORD_INVALID", null);
    private static final Rejection NOT_JOINED = new Rejection("SESSION_RECORD_PLAYER_NOT_JOINED", null);

    private static RecordOperationResult rejected(UUID clientRef, Long requestedId, Rejection rejection) {
        RecordOperationResult result = result(clientRef, requestedId, null, RecordOperationStatus.REJECTED);
        markRejected(result, rejection);
        return result;
    }

    private static void markRejected(RecordOperationResult result, Rejection rejection) {
        result.setStatus(RecordOperationStatus.REJECTED);
        result.setId(null);
        result.setErrorCode(rejection.code());
        result.setErrorParams(rejection.params());
    }

    private static boolean tooDeep(Object node, int depth) {
        Collection<?> children = node instanceof Map<?, ?> map ? map.values()
                : node instanceof Collection<?> collection ? collection : null;
        if (children == null) {
            return false;   // a scalar is not a nesting level
        }
        if (depth > MAX_DEPTH) {
            return true;
        }
        for (Object child : children) {
            if (tooDeep(child, depth + 1)) {
                return true;
            }
        }
        return false;
    }

    /** Which of the named players are {@code JOINED} in the session: one query for all of them. */
    private Set<UUID> joinedAmong(Long sessionId, Set<UUID> named) {
        if (named.isEmpty()) {
            return Set.of();
        }
        return participantRepository
                .findBySessionIdAndStatusAndUserIdIn(sessionId, ParticipantStatus.JOINED, named).stream()
                .map(SessionParticipant::getUserId)
                .collect(Collectors.toSet());
    }

    private static SessionRecord newRecord(Long sessionId, UUID clientRequestId,
                                           Map<String, Object> data, UUID actor, Instant now) {
        return SessionRecord.builder()
                .sessionId(sessionId)
                .data(new LinkedHashMap<>(data))
                .clientRequestId(clientRequestId)
                .createdBy(actor)
                .createdAt(now)
                .updatedBy(actor)
                .updatedAt(now)
                .build();
    }

    private static RecordOperationResult result(UUID clientRef, Long requestedId, Long id, RecordOperationStatus status) {
        return RecordOperationResult.builder().clientRef(clientRef).requestedId(requestedId).id(id).status(status).build();
    }

    private static List<SessionRecordDto> toDtos(List<SessionRecord> records) {
        return records.stream()
                .map(r -> SessionRecordDto.builder()
                        .id(r.getId())
                        .data(r.getData())
                        .createdBy(r.getCreatedBy())
                        .createdAt(r.getCreatedAt())
                        .updatedBy(r.getUpdatedBy())
                        .updatedAt(r.getUpdatedAt())
                        .build())
                .toList();
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static BadRequestException invalid(String message) {
        return new BadRequestException("SESSION_RECORD_INVALID", message, null);
    }
}
