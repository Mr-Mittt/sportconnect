package com.sportconnect.session.stats;

import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.record.RecordFacts;
import com.sportconnect.session.record.RecordRankingSupport;
import com.sportconnect.session.record.RecordTypeReader;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.record.SessionRecordVerification;
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-55 (extracted from {@link SessionStatsProcessor}): reads one completed session's games the way the statistics engine counts
 * them, so the engine and a season (which counts a session on its own, at finalise or when a session is linked) read exactly the same games.
 *
 * <p>A record is a <b>game</b> when the sport's reader says it is valid and countable (an outcome), and every player named in it is still
 * {@code JOINED}; any other record is <b>ignored</b> with the reason. A game is a <b>ranking game</b> when it was proposed and every named
 * player confirmed its current revision (SESSION-72). Reads only; it writes nothing and takes no lock.
 */
@Component
@RequiredArgsConstructor
public class SessionGames {

    /** A counted-to-be game: the record, what the reader made of it, and whether it is a ranking game. */
    public record Game(SessionRecord record, RecordFacts facts, boolean ranking) {
    }

    /** A record that is not counted, with the reason the job's {@code result} shows. */
    public record Ignored(Long recordId, String reason) {
    }

    /** What reading a session gave: its games, the ignored records, the {@code JOINED} players, and whether it has no records at all. */
    public record Read(List<Game> games, List<Ignored> ignored, Set<UUID> joined, boolean noRecords) {
    }

    private final SessionRecordRepository recordRepository;
    private final SessionRecordVerificationRepository verificationRepository;
    private final SessionParticipantRepository participantRepository;
    private final RecordRankingSupport rankingSupport;

    /**
     * Reads the session's records through the reader of the sport's schema.
     *
     * @param schema the sport's result schema; {@code reader} is the reader {@code RecordReaders} chose for it
     */
    public Read read(Session session, Map<String, Object> schema, RecordTypeReader reader) {
        Long sessionId = session.getId();
        List<SessionRecord> records = recordRepository.findBySessionIdOrderByIdAsc(sessionId);
        Set<UUID> joined = participantRepository.findBySessionIdAndStatusIn(sessionId, List.of(ParticipantStatus.JOINED))
                .stream().map(SessionParticipant::getUserId).collect(Collectors.toSet());
        Map<Long, List<SessionRecordVerification>> confirmations = confirmationsOf(records);

        List<Game> games = new ArrayList<>();
        List<Ignored> ignored = new ArrayList<>();
        for (SessionRecord record : records) {
            RecordFacts facts = reader.read(schema, record.getData());
            if (!facts.valid()) {
                ignored.add(new Ignored(record.getId(), facts.invalidReason()));
            } else if (!facts.countable()) {
                ignored.add(new Ignored(record.getId(), facts.notCountableReason()));
            } else if (!joined.containsAll(facts.players())) {
                ignored.add(new Ignored(record.getId(), "PLAYER_NOT_JOINED"));
            } else {
                games.add(new Game(record, facts, isRanking(record, facts, confirmations)));
            }
        }
        return new Read(games, ignored, joined, records.isEmpty());
    }

    /** A ranking game: proposed, and every named player confirmed the record's current revision (SESSION-72). */
    private boolean isRanking(SessionRecord record, RecordFacts facts, Map<Long, List<SessionRecordVerification>> byRecord) {
        if (record.getRankingRequestedAt() == null) {
            return false;
        }
        Set<UUID> confirmed = new HashSet<>(rankingSupport.confirmedPlayers(record,
                byRecord.getOrDefault(record.getId(), List.of())));
        // Rankable = a score in the ranking slot, the same number of players on both sides and an outcome (SESSION-72/80).
        return facts.rankable() && confirmed.containsAll(facts.players());
    }

    private Map<Long, List<SessionRecordVerification>> confirmationsOf(List<SessionRecord> records) {
        List<Long> proposed = records.stream().filter(r -> r.getRankingRequestedAt() != null).map(SessionRecord::getId).toList();
        if (proposed.isEmpty()) {
            return Map.of();
        }
        return verificationRepository.findByRecordIdIn(proposed).stream()
                .collect(Collectors.groupingBy(SessionRecordVerification::getRecordId));
    }
}
