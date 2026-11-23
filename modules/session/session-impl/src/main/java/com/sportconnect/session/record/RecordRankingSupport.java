package com.sportconnect.session.record;

import com.sportconnect.session.api.dto.RankingStatus;
import com.sportconnect.session.api.dto.RecordRankingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-72: derives the ranking state of records (NORMAL, PROPOSED, VERIFIED) from the proposal fields on the record
 * and the confirmation rows. Nothing about VERIFIED is stored: it is recomputed on every read from the record's current
 * {@code revision}, so an edit invalidates confirmations with no write to them.
 */
@Component
@RequiredArgsConstructor
public class RecordRankingSupport {

    private final SessionRecordVerificationRepository verificationRepository;
    private final RecordReaders readers;

    /**
     * The state of each record, keyed by record id: one query for the confirmations of all the proposed records, none
     * when none is proposed.
     *
     * @param schema the sport's result schema, or {@code null} when it has none (then a proposed record can never read
     *               as {@code VERIFIED})
     */
    public Map<Long, RecordRankingDto> rankingFor(List<SessionRecord> records, Map<String, Object> schema) {
        List<Long> proposedIds = records.stream()
                .filter(r -> r.getRankingRequestedAt() != null)
                .map(SessionRecord::getId)
                .toList();
        Map<Long, List<SessionRecordVerification>> byRecord = proposedIds.isEmpty() ? Map.of()
                : verificationRepository.findByRecordIdIn(proposedIds).stream()
                        .collect(Collectors.groupingBy(SessionRecordVerification::getRecordId));
        Optional<RecordTypeReader> reader = readers.forSchema(schema);

        Map<Long, RecordRankingDto> result = new HashMap<>();
        for (SessionRecord record : records) {
            result.put(record.getId(), state(record, byRecord.getOrDefault(record.getId(), List.of()), reader, schema));
        }
        return result;
    }

    /** The players whose confirmation counts for the record's current content, in the order they confirmed. */
    public List<UUID> confirmedPlayers(SessionRecord record, List<SessionRecordVerification> confirmations) {
        return confirmations.stream()
                .filter(c -> c.getRevision().equals(record.getRevision()))
                .sorted(Comparator.comparing(SessionRecordVerification::getVerifiedAt))
                .map(SessionRecordVerification::getUserId)
                .toList();
    }

    private RecordRankingDto state(SessionRecord record, List<SessionRecordVerification> confirmations,
                                   Optional<RecordTypeReader> reader, Map<String, Object> schema) {
        if (record.getRankingRequestedAt() == null) {
            return RecordRankingDto.builder().status(RankingStatus.NORMAL).confirmedBy(List.of()).build();
        }
        List<UUID> confirmed = confirmedPlayers(record, confirmations);
        boolean verified = false;
        if (reader.isPresent()) {
            RecordFacts facts = reader.get().read(schema, record.getData());
            Set<UUID> confirmedSet = Set.copyOf(confirmed);
            verified = facts.rankable() && !facts.players().isEmpty() && confirmedSet.containsAll(facts.players());
        }
        return RecordRankingDto.builder()
                .status(verified ? RankingStatus.VERIFIED : RankingStatus.PROPOSED)
                .requestedBy(record.getRankingRequestedBy())
                .confirmedBy(confirmed)
                .build();
    }
}
