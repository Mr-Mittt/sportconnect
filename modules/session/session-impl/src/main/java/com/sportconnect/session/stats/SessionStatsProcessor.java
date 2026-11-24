package com.sportconnect.session.stats;

import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.RecordFacts;
import com.sportconnect.session.record.RecordRankingSupport;
import com.sportconnect.session.record.RecordReaders;
import com.sportconnect.session.record.RecordTypeReader;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.record.SessionRecordVerification;
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * SESSION-53: counts one completed session, in one {@code REQUIRES_NEW} transaction that either counts everything or
 * nothing (a failure rolls all of it back and the caller records the failure separately).
 *
 * <p>Flow: take the job row's lock and check this attempt still owns the claim; read the sport's schema, the session's
 * records, the confirmations, who is {@code JOINED} and the venue's country and region; read each record through the reader
 * of its type and sort the records into <i>counted</i> and <i>ignored (with a reason)</i>; make sure the participants'
 * statistics rows exist, lock them in one ordered statement, change the blobs in code, upsert the leaderboard entries of
 * every board the games touch, mark those boards dirty, and finish the job row with what was counted.
 *
 * <p><b>What counts.</b> A record is counted when the reader says it is valid with a complete score and the first team ahead
 * (a record with no score, or one the reader cannot turn into a result, is ignored with the reader's reason), and every
 * player named in it is still {@code JOINED} in the session (reason {@code PLAYER_NOT_JOINED}). A counted game is a
 * <b>ranking game</b> when it was proposed and every named player confirmed its current revision (SESSION-72); otherwise it
 * is a normal game. Every counted game feeds the players' personal counters and, in a group session, the group member
 * counters and the group board; a ranking game also feeds the region and country scopes of the <b>venue</b> for every player,
 * wherever the player lives, and those boards (owner, 2026-11-23). A venue with no country or no region gets no counter for
 * the missing place, and the job's {@code notes} say so.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionStatsProcessor {

    /** The claim this attempt took is no longer its own (another worker took it over); nothing was changed. */
    public static class ClaimLostException extends RuntimeException {
        public ClaimLostException(Long sessionId) {
            super("The statistics claim on session " + sessionId + " is no longer this attempt's");
        }
    }

    /** What one session's counting came to. */
    public record Result(SessionStatsJob.Status status, int counted, int ignored) {
    }

    private record Game(SessionRecord record, RecordFacts facts, boolean ranking) {
    }

    private record Ignored(Long recordId, String reason) {
    }

    private final SessionStatsJobRepository jobRepository;
    private final SessionRepository sessionRepository;
    private final SessionRecordRepository recordRepository;
    private final SessionRecordVerificationRepository verificationRepository;
    private final SessionParticipantRepository participantRepository;
    private final RecordReaders readers;
    private final RecordRankingSupport rankingSupport;
    private final SportService sportService;
    private final LocationService locationService;
    private final UserSportStatsRepository userStatsRepository;
    private final GroupMemberStatsRepository groupStatsRepository;
    private final LeaderboardEntryRepository leaderboardRepository;
    private final StatBoardRunRepository boardRunRepository;
    private final SessionStatsWriter writer;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /**
     * Counts the session this attempt has claimed.
     *
     * @param claimedAt the claim time this attempt took; the job row must still be {@code RUNNING} with it
     * @throws ClaimLostException when it is not (another worker took the row over)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Result process(Long sessionId, Instant claimedAt) {
        SessionStatsJob job = jobRepository.findForUpdate(sessionId).orElseThrow(() -> new ClaimLostException(sessionId));
        if (job.getStatus() != SessionStatsJob.Status.RUNNING || !claimedAt.equals(job.getClaimedAt())) {
            throw new ClaimLostException(sessionId);
        }
        Instant now = clock.instant();

        Optional<String> skip = Optional.empty();
        Session session = sessionRepository.findById(sessionId).orElse(null);
        Map<String, Object> schema = null;
        RecordTypeReader reader = null;
        if (session == null || session.getStatus() != SessionStatus.COMPLETED) {
            skip = Optional.of("SESSION_NOT_COMPLETED");
        } else {
            schema = optionalSchema(session.getSportId());
            if (schema == null) {
                skip = Optional.of("NO_RESULT_SCHEMA");
            } else {
                reader = readers.forSchema(schema).orElse(null);
                if (reader == null) {
                    skip = Optional.of("NO_READER");
                }
            }
        }
        if (skip.isPresent()) {
            return finish(job, now, List.of(), List.of(), List.of(skip.get()));
        }

        List<SessionRecord> records = recordRepository.findBySessionIdOrderByIdAsc(sessionId);
        if (records.isEmpty()) {
            return finish(job, now, List.of(), List.of(), List.of("NO_RECORDS"));
        }
        Set<UUID> joined = participantRepository.findBySessionIdAndStatusIn(sessionId, List.of(ParticipantStatus.JOINED))
                .stream().map(SessionParticipant::getUserId).collect(Collectors.toSet());
        Map<Long, List<SessionRecordVerification>> confirmations = confirmationsOf(records);

        List<Game> games = new ArrayList<>();
        List<Ignored> ignored = new ArrayList<>();
        for (SessionRecord record : records) {
            RecordFacts facts = reader.read(schema, record.getData());
            if (!facts.valid()) {
                ignored.add(new Ignored(record.getId(), facts.invalidReason()));
            } else if (!facts.rankable()) {
                ignored.add(new Ignored(record.getId(), facts.notRankableReason()));
            } else if (!joined.containsAll(facts.players())) {
                ignored.add(new Ignored(record.getId(), "PLAYER_NOT_JOINED"));
            } else {
                games.add(new Game(record, facts, isRanking(record, facts, confirmations)));
            }
        }
        if (games.isEmpty()) {
            return finish(job, now, List.of(), ignored, List.of());
        }

        List<String> notes = new ArrayList<>();
        Venue venue = venueOf(session);
        if (games.stream().anyMatch(Game::ranking)) {
            if (venue.countryId() == null) {
                notes.add("NO_VENUE_COUNTRY");
            } else if (venue.regionId() == null) {
                notes.add("NO_VENUE_REGION");
            }
        }
        List<CountedGame> countedIds = apply(session, StatisticsSchema.of(schema), games, venue, ignored, now);
        return finish(job, now, countedIds, ignored, notes);
    }

    /** A ranking game: proposed, and every named player confirmed the record's current revision (SESSION-72). */
    private boolean isRanking(SessionRecord record, RecordFacts facts, Map<Long, List<SessionRecordVerification>> byRecord) {
        if (record.getRankingRequestedAt() == null) {
            return false;
        }
        Set<UUID> confirmed = new HashSet<>(rankingSupport.confirmedPlayers(record,
                byRecord.getOrDefault(record.getId(), List.of())));
        return confirmed.containsAll(facts.players());
    }

    private Map<Long, List<SessionRecordVerification>> confirmationsOf(List<SessionRecord> records) {
        List<Long> proposed = records.stream().filter(r -> r.getRankingRequestedAt() != null).map(SessionRecord::getId).toList();
        if (proposed.isEmpty()) {
            return Map.of();
        }
        return verificationRepository.findByRecordIdIn(proposed).stream()
                .collect(Collectors.groupingBy(SessionRecordVerification::getRecordId));
    }

    private record Venue(Long countryId, Long regionId) {
    }

    private Venue venueOf(Session session) {
        if (session.getLocationId() == null) {
            return new Venue(null, null);
        }
        LocationResponse location = locationService.getLocationsByIds(List.of(session.getLocationId()))
                .get(session.getLocationId());
        return location == null ? new Venue(null, null) : new Venue(location.getCountryId(), location.getRegionId());
    }

    /** The sport's result schema, or {@code null} when the sport is gone or has none. */
    private Map<String, Object> optionalSchema(Long sportId) {
        try {
            return sportService.getResultSchema(sportId);
        } catch (ResourceNotFoundException e) {
            return null;
        }
    }

    /**
     * Changes the blobs and the projection for the counted games.
     *
     * @return the records actually counted, each with whether it counted as a ranking game (a record whose history pointer
     *         already exists is not counted again and is added to {@code ignored} as {@code ALREADY_COUNTED})
     */
    private List<CountedGame> apply(Session session, StatisticsSchema stats, List<Game> games, Venue venue,
                             List<Ignored> ignored, Instant now) {
        Long sportId = session.getSportId();
        Long groupId = session.getGroupId();
        Set<UUID> users = new TreeSet<>(java.util.Comparator.comparing(UUID::toString));
        games.forEach(game -> users.addAll(game.facts().players()));

        Map<UUID, UserSportStats> userRows = lockUserRows(sportId, users);
        Map<UUID, PlayerStatsDoc> players = new LinkedHashMap<>();
        userRows.forEach((id, row) -> players.put(id, PlayerStatsDoc.read(row)));
        Map<UUID, GroupMemberStats> groupRows = groupId == null ? Map.of() : lockGroupRows(groupId, sportId, users);
        Map<UUID, GroupStatsDoc> members = new LinkedHashMap<>();
        groupRows.forEach((id, row) -> members.put(id, GroupStatsDoc.read(row)));

        Map<LeaderboardEntry.Key, StatsCounters> touched = new LinkedHashMap<>();
        List<CountedGame> counted = new ArrayList<>();
        for (Game game : games) {
            long recordId = game.record().getId();
            boolean already = game.facts().players().stream().anyMatch(p -> players.get(p).hasPointer(recordId));
            if (already) {
                ignored.add(new Ignored(recordId, "ALREADY_COUNTED"));
                continue;
            }
            counted.add(new CountedGame(recordId, game.ranking()));
            for (RecordFacts.Participant participant : game.facts().participants()) {
                List<UUID> team = game.facts().teams().get(participant.team());
                Map<String, List<String>> groups = groupKeys(stats, participant.userId(), team);
                List<String> combos = groups.getOrDefault(StatisticsSchema.TEAM, List.of());
                PlayerStatsDoc doc = players.get(participant.userId());
                countPlayer(doc, participant, groups, game.ranking(), stats, venue);
                doc.addPointer(recordId, session.getId(), game.ranking());
                if (groupId != null) {
                    GroupStatsDoc member = members.get(participant.userId());
                    member.counters().add(participant.outcome(), participant.metrics(), stats.metrics());
                    addToGroups(groups, member::group, participant, stats);
                    member.addPointer(recordId, session.getId(), game.ranking());
                    touch(touched, "GROUP", groupId, sportId, participant.userId(), member.counters(), combos,
                            key -> member.group(StatisticsSchema.TEAM, key));
                }
                if (game.ranking()) {
                    if (venue.regionId() != null) {
                        PlayerStatsDoc.Scope region = doc.scope("REGION", venue.countryId(), venue.regionId());
                        touch(touched, "REGION", venue.regionId(), sportId, participant.userId(), region.counters(), combos,
                                key -> region.group(StatisticsSchema.TEAM, key));
                    }
                    if (venue.countryId() != null) {
                        PlayerStatsDoc.Scope country = doc.scope("COUNTRY", venue.countryId(), null);
                        touch(touched, "COUNTRY", venue.countryId(), sportId, participant.userId(), country.counters(),
                                combos, key -> country.group(StatisticsSchema.TEAM, key));
                    }
                }
            }
        }

        userRows.forEach((id, row) -> {
            players.get(id).writeTo(row);
            userStatsRepository.save(row);
        });
        groupRows.forEach((id, row) -> {
            members.get(id).writeTo(row);
            groupStatsRepository.save(row);
        });
        upsertEntries(touched, stats, now);
        markBoardsDirty(touched.keySet(), now);
        return counted;
    }

    /**
     * The group keys of one player in one game, by dimension, for the groupings the sport's schema asks for: {@code PARTNER}
     * (each other member of the team) and {@code TEAM} (every team of the schema's size the player is in).
     */
    private Map<String, List<String>> groupKeys(StatisticsSchema stats, UUID player, List<UUID> team) {
        Map<String, List<String>> keys = new LinkedHashMap<>();
        for (StatisticsSchema.Grouping grouping : stats.groupBy()) {
            List<String> list = grouping.by().equals(StatisticsSchema.PARTNER)
                    ? StatsCombos.partnersOf(player, team) : StatsCombos.keysFor(player, team, grouping.size());
            if (!list.isEmpty()) {
                keys.put(grouping.by(), list);
            }
        }
        return keys;
    }

    /** Adds one player's game to the counters of each of their groups. */
    private void addToGroups(Map<String, List<String>> groups, BiFunction<String, String, StatsCounters> counters,
                             RecordFacts.Participant p, StatisticsSchema stats) {
        groups.forEach((by, keys) -> keys.forEach(key -> counters.apply(by, key).add(p.outcome(), p.metrics(), stats.metrics())));
    }

    /** The counters of one player for one game: personal, every group of their team, and the venue's scopes (ranking games). */
    private void countPlayer(PlayerStatsDoc doc, RecordFacts.Participant p, Map<String, List<String>> groups, boolean ranking,
                             StatisticsSchema stats, Venue venue) {
        doc.personal().all().add(p.outcome(), p.metrics(), stats.metrics());
        addToGroups(groups, (by, key) -> doc.group(by, key).all(), p, stats);
        if (!ranking) {
            return;
        }
        doc.personal().ranked().add(p.outcome(), p.metrics(), stats.metrics());
        addToGroups(groups, (by, key) -> doc.group(by, key).ranked(), p, stats);
        if (venue.regionId() != null) {
            PlayerStatsDoc.Scope region = doc.scope("REGION", venue.countryId(), venue.regionId());
            region.counters().add(p.outcome(), p.metrics(), stats.metrics());
            addToGroups(groups, region::group, p, stats);
        }
        if (venue.countryId() != null) {
            PlayerStatsDoc.Scope country = doc.scope("COUNTRY", venue.countryId(), null);
            country.counters().add(p.outcome(), p.metrics(), stats.metrics());
            addToGroups(groups, country::group, p, stats);
        }
    }

    /** Remembers the board entries a player's game touched, each pointing at the live counters it will be computed from. */
    private void touch(Map<LeaderboardEntry.Key, StatsCounters> touched, String scopeType, Long scopeId, Long sportId,
                       UUID player, StatsCounters single, List<String> combos, Function<String, StatsCounters> comboCounters) {
        touched.putIfAbsent(new LeaderboardEntry.Key(scopeType, scopeId, sportId, "SINGLE", player.toString()), single);
        for (String combo : combos) {
            touched.putIfAbsent(new LeaderboardEntry.Key(scopeType, scopeId, sportId, "COMBO", combo),
                    comboCounters.apply(combo));
        }
    }

    /**
     * Makes sure every user has a row, then locks them all in one ordered statement. The missing rows are created first,
     * each in its own small transaction (a concurrent creator's duplicate-key error is absorbed), and only then is
     * anything locked, so every transaction takes its locks in one pass in the same order and cannot deadlock with another.
     */
    private Map<UUID, UserSportStats> lockUserRows(Long sportId, Set<UUID> users) {
        Set<UUID> existing = new HashSet<>(userStatsRepository.findExistingUserIds(sportId, users));
        for (UUID user : users) {
            if (!existing.contains(user)) {
                try {
                    writer.ensureUserRow(user, sportId);
                } catch (DataIntegrityViolationException e) {
                    log.info("Statistics row race absorbed: user {} sport {}", user, sportId);
                }
            }
        }
        return userStatsRepository.lockAll(sportId, users).stream()
                .collect(Collectors.toMap(UserSportStats::getUserId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    private Map<UUID, GroupMemberStats> lockGroupRows(Long groupId, Long sportId, Set<UUID> users) {
        Set<UUID> existing = new HashSet<>(groupStatsRepository.findExistingUserIds(groupId, sportId, users));
        for (UUID user : users) {
            if (!existing.contains(user)) {
                try {
                    writer.ensureGroupRow(groupId, user, sportId);
                } catch (DataIntegrityViolationException e) {
                    log.info("Group statistics row race absorbed: group {} user {} sport {}", groupId, user, sportId);
                }
            }
        }
        return groupStatsRepository.lockAll(groupId, sportId, users).stream()
                .collect(Collectors.toMap(GroupMemberStats::getUserId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    /**
     * One upsert per touched entry, written once from the final counters of the session. The entry's own player rows are
     * locked, and any other writer of the same entry holds the same player locks, so a plain read then write is safe here.
     */
    private void upsertEntries(Map<LeaderboardEntry.Key, StatsCounters> touched, StatisticsSchema stats, Instant now) {
        Map<LeaderboardEntry.Key, LeaderboardEntry> existing = leaderboardRepository.findAllById(touched.keySet()).stream()
                .collect(Collectors.toMap(e -> new LeaderboardEntry.Key(e.getScopeType(), e.getScopeId(), e.getSportId(),
                        e.getKind(), e.getSubjectKey()), Function.identity()));
        List<LeaderboardEntry> toSave = new ArrayList<>();
        touched.forEach((key, counters) -> {
            LeaderboardEntry entry = existing.get(key);
            if (entry == null) {
                entry = new LeaderboardEntry(key.getScopeType(), key.getScopeId(), key.getSportId(), key.getKind(),
                        key.getSubjectKey(), null, null, null, 0, null, null, now);
            }
            List<StatisticsSchema.SortKey> sort = stats.sort();
            entry.setK1(sort.size() > 0 ? stats.valueOf(sort.get(0).by(), counters) : null);
            entry.setK2(sort.size() > 1 ? stats.valueOf(sort.get(1).by(), counters) : null);
            entry.setK3(sort.size() > 2 ? stats.valueOf(sort.get(2).by(), counters) : null);
            entry.setGames((int) counters.games());
            entry.setUpdatedAt(now);
            toSave.add(entry);
        });
        leaderboardRepository.saveAll(toSave);
    }

    /** Marks each touched board dirty, boards in one sorted order so two sessions touching the same boards cannot deadlock. */
    private void markBoardsDirty(Collection<LeaderboardEntry.Key> keys, Instant now) {
        Set<String> boards = new TreeSet<>();
        Map<String, LeaderboardEntry.Key> byBoard = new LinkedHashMap<>();
        for (LeaderboardEntry.Key key : keys) {
            String board = key.getScopeType() + ":" + String.format("%020d", key.getScopeId());
            boards.add(board);
            byBoard.putIfAbsent(board, key);
        }
        for (String board : boards) {
            LeaderboardEntry.Key key = byBoard.get(board);
            try {
                writer.ensureBoardRun(key.getSportId(), key.getScopeType(), key.getScopeId());
            } catch (DataIntegrityViolationException e) {
                log.info("Board run row race absorbed: {} {}", key.getScopeType(), key.getScopeId());
            }
            boardRunRepository.markDirty(key.getSportId(), key.getScopeType(), key.getScopeId(), now);
        }
    }

    /** A game that was counted, and whether it counted as a ranking game: the same mark as the history pointer's. */
    private record CountedGame(long recordId, boolean ranking) {
    }

    private Result finish(SessionStatsJob job, Instant now, List<CountedGame> counted, List<Ignored> ignored,
                          List<String> notes) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("counted", counted.stream().map(c -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("recordId", c.recordId());
            entry.put("ranking", c.ranking());
            return (Object) entry;
        }).toList());
        result.put("ignored", ignored.stream().map(i -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("recordId", i.recordId());
            entry.put("reason", i.reason());
            return (Object) entry;
        }).toList());
        result.put("notes", notes);
        SessionStatsJob.Status status = counted.isEmpty() ? SessionStatsJob.Status.SKIPPED : SessionStatsJob.Status.DONE;
        job.setStatus(status);
        job.setCounted(counted.size());
        job.setIgnored(ignored.size());
        job.setResult(result);
        job.setFinishedAt(now);
        job.setUpdatedAt(now);
        job.setNextAttemptAt(null);
        job.setLastError(null);
        jobRepository.save(job);
        log.info("Statistics for session {}: {} counted, {} ignored, {}", job.getSessionId(), counted.size(), ignored.size(),
                status);
        return new Result(status, counted.size(), ignored.size());
    }

}
