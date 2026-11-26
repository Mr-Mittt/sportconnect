package com.sportconnect.session.stats;

import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.group.api.service.GroupMemberNumberService;
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
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
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
import java.util.Comparator;
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
 * <p>Flow: take the job row's lock and check this attempt still owns the claim; read the sport's schema and check the sport
 * still has statistics switched on and its schema collects something; read the session's records, the confirmations, who is
 * {@code JOINED} and the venue's country and region; read each record through the reader of its type and sort the records
 * into <i>counted</i> and <i>ignored (with a reason)</i>; make sure the participants' statistics rows exist, lock them in one
 * ordered statement, change the blobs in code, mark every board the games touch dirty, and finish the job row with what was
 * counted. <b>The engine writes nothing to {@code leaderboard_entry}</b> (owner, 2026-11-25): SESSION-54's job builds and ranks
 * the boards from the blobs, and only needs to be told which boards changed.
 *
 * <p><b>What counts.</b> A record is counted when the reader says it is valid with a complete score and the first team ahead
 * (a record with no score, or one the reader cannot turn into a result, is ignored with the reader's reason), and every
 * player named in it is still {@code JOINED} in the session (reason {@code PLAYER_NOT_JOINED}). A counted game is a
 * <b>ranking game</b> when it was proposed and every named player confirmed its current revision (SESSION-72); otherwise it
 * is a normal game. Every counted game feeds the players' personal counters and, in a group session, the group member
 * counters; a ranking game also feeds the region and country scopes of the <b>venue</b> for every player, wherever the
 * player lives (owner, 2026-11-23). A venue with no country or no region gets no counter for the missing place, and the
 * job's {@code notes} say so. Only the stats the sport's {@code record.scoreboard.columns} need are counted. <b>The {@code sessions} stat (SESSION-82)</b> is counted once per player after the games, for the players the sport's {@link StatisticsSchema.SessionsRule} selects (joined by default): in the player's totals and the group member row, and in the ranked, region and country counters only for a player with a ranking game; a session with no games is still counted when the rule counts joined players, and a job row that already counted sessions never counts them again. In a group
 * session of a sport grouped by {@code PARTNER}, a game of two pairs also counts in the group's head-to-head
 * ({@link GroupH2hDoc}).
 *
 * <p><b>Two refusals before anything is counted.</b> A sport whose statistics were switched off after the session was picked
 * (the runner only picks enabled sports) gives its job row back: the row is deleted, so switching the sport on later counts
 * the session. A sport whose schema collects nothing ({@code STATISTICS_NOT_CONFIGURED}) is {@code SKIPPED} for good, so
 * the runner does not meet the same sessions at every tick; a column added later has no history until the SESSION-77 rebuild.
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

    /** A board a game touched; SESSION-54 ranks it. {@code countryId} is a region board's country, a country board's own id, none for a group. */
    private record Board(String scopeType, Long scopeId, Long sportId, Long countryId) {
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
    private final GroupMemberStatsRepository groupMemberStatsRepository;
    private final GroupStatsRepository groupStatsRepository;
    private final GroupSessionSettingsRepository groupSettingsRepository;
    // SESSION-81: the group's own member numbers, the keys of a group's partner counters and of its head-to-head.
    private final GroupMemberNumberService memberNumbers;
    private final StatBoardRunRepository boardRunRepository;
    // SESSION-54: who changed on each board, appended in the counting transaction (the ranking job rebuilds those players' entries).
    private final StatBoardChangeRepository changeRepository;
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
        if (!sportService.isStatisticsEnabled(session.getSportId())) {
            // Switched off after the runner picked this session: give the row back, so that switching the sport on later
            // makes the session due again. The runner never picks a disabled sport's sessions, so it is not met again now.
            jobRepository.delete(job);
            log.info("Statistics for session {} not counted: statistics are switched off for sport {}", sessionId,
                    session.getSportId());
            return new Result(SessionStatsJob.Status.SKIPPED, 0, 0);
        }
        StatisticsSchema stats = StatisticsSchema.of(schema);
        if (!stats.collects()) {
            return finish(job, now, List.of(), List.of(), List.of("STATISTICS_NOT_CONFIGURED"));
        }

        List<SessionRecord> records = recordRepository.findBySessionIdOrderByIdAsc(sessionId);
        Set<UUID> joined = participantRepository.findBySessionIdAndStatusIn(sessionId, List.of(ParticipantStatus.JOINED))
                .stream().map(SessionParticipant::getUserId).collect(Collectors.toSet());
        // SESSION-82: a revived job row (the second line of defence) must not count the session's players a second time
        int priorSessions = job.getResult() != null && job.getResult().get("sessions") instanceof Number n ? Math.max(0, n.intValue()) : 0;
        // SESSION-82: a sport whose `sessions` rule counts a joined player without a game still counts a session with no games
        boolean sessionsWithoutGames = priorSessions == 0 && stats.collectsSessions() && stats.sessionsRule().counts(true, false) && !joined.isEmpty();
        if (records.isEmpty() && !sessionsWithoutGames) {
            return finish(job, now, List.of(), List.of(), List.of("NO_RECORDS"), priorSessions);
        }
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
        // SESSION-82: who gets +1 in the `sessions` stat, by the sport's rule (joined players only: a counted game needs one)
        Set<UUID> gamePlayers = new HashSet<>();
        Set<UUID> rankingPlayers = new HashSet<>();
        for (Game game : games) {
            gamePlayers.addAll(game.facts().players());
            if (game.ranking()) {
                rankingPlayers.addAll(game.facts().players());
            }
        }
        Set<UUID> sessionPlayers = new TreeSet<>(Comparator.comparing(UUID::toString));
        if (stats.collectsSessions() && priorSessions == 0) {
            for (UUID player : joined) {
                if (stats.sessionsRule().counts(true, gamePlayers.contains(player))) {
                    sessionPlayers.add(player);
                }
            }
        }
        if (games.isEmpty() && sessionPlayers.isEmpty()) {
            return finish(job, now, List.of(), ignored, List.of(), priorSessions);
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
        Applied applied = apply(session, stats, games, venue, ignored, now, sessionPlayers, rankingPlayers);
        return finish(job, now, applied.counted(), ignored, notes, priorSessions + applied.sessions());
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
     * Changes the blobs for the counted games and marks the boards they touch dirty.
     *
     * @return the records actually counted, each with whether it counted as a ranking game (a record whose history pointer
     *         already exists is not counted again and is added to {@code ignored} as {@code ALREADY_COUNTED})
     */
    private Applied apply(Session session, StatisticsSchema stats, List<Game> games, Venue venue,
                             List<Ignored> ignored, Instant now, Set<UUID> sessionPlayers, Set<UUID> rankingPlayers) {
        Long sportId = session.getSportId();
        // SESSION-78: a group session is counted into the group's own rows (member statistics, head-to-head, the GROUP board)
        // only while the group has its switch on, read now, at counting time; the players' own statistics are counted either way.
        Long groupId = session.getGroupId() != null && groupSettingsRepository.existsByGroupIdAndStatisticsEnabledTrue(session.getGroupId())
                ? session.getGroupId() : null;
        Set<UUID> users = new TreeSet<>(Comparator.comparing(UUID::toString));
        games.forEach(game -> users.addAll(game.facts().players()));
        users.addAll(sessionPlayers);
        // SESSION-81: a group's rows name its members by the group's permanent member numbers, not by user id. They are read (and
        // allocated, in a short transaction of their own) before anything is locked; a sport with no grouping needs none.
        Map<UUID, Integer> numbers = groupId != null && !stats.groupBy().isEmpty()
                ? memberNumbers.getMemberNumbers(groupId, users) : Map.of();

        // The one lock order: user rows, then group-member rows, then the group's own row, each table in one ordered pass.
        Map<UUID, UserSportStats> userRows = lockUserRows(sportId, users);
        Map<UUID, PlayerStatsDoc> players = new LinkedHashMap<>();
        userRows.forEach((id, row) -> players.put(id, PlayerStatsDoc.read(row)));
        Map<UUID, GroupMemberStats> groupRows = groupId == null ? Map.of() : lockGroupRows(groupId, sportId, users);
        Map<UUID, GroupStatsDoc> members = new LinkedHashMap<>();
        groupRows.forEach((id, row) -> members.put(id, GroupStatsDoc.read(row)));
        boolean headToHead = groupId != null && stats.groupsByPartner() && games.stream().anyMatch(this::isTwoPairs);
        GroupStats h2hRow = headToHead ? lockGroupStatsRow(groupId, sportId) : null;
        GroupH2hDoc h2h = h2hRow == null ? null : GroupH2hDoc.read(h2hRow);

        Set<Board> boards = new TreeSet<>(Comparator.comparing((Board b) -> b.scopeType())
                .thenComparing(b -> String.format("%020d", b.scopeId())));
        // SESSION-54: the players whose entries changed, by board (each player once per board for the whole session)
        Map<Board, Set<UUID>> changed = new LinkedHashMap<>();
        List<CountedGame> counted = new ArrayList<>();
        // SESSION-82: a player with a game of this session already counted before is not counted for the session again
        Set<UUID> alreadyCounted = new HashSet<>();
        for (Game game : games) {
            long recordId = game.record().getId();
            boolean already = game.facts().players().stream().anyMatch(p -> players.get(p).hasPointer(recordId));
            if (already) {
                ignored.add(new Ignored(recordId, "ALREADY_COUNTED"));
                alreadyCounted.addAll(game.facts().players());
                continue;
            }
            counted.add(new CountedGame(recordId, game.ranking()));
            for (RecordFacts.Participant participant : game.facts().participants()) {
                List<UUID> team = game.facts().teams().get(participant.team());
                Map<String, List<String>> groups = groupKeys(stats, participant.userId(), team);
                PlayerStatsDoc doc = players.get(participant.userId());
                countPlayer(doc, participant, groups, game.ranking(), stats, venue);
                doc.addPointer(recordId, game.ranking());
                if (groupId != null) {
                    GroupStatsDoc member = members.get(participant.userId());
                    member.counters().add(participant.outcome(), participant.metrics(), stats.collected());
                    addToGroups(memberKeys(groups, numbers), member::group, participant, stats);
                    member.addPointer(recordId, game.ranking());
                    touch(boards, changed, new Board("GROUP", groupId, sportId, null), participant.userId());
                }
                if (game.ranking()) {
                    if (venue.regionId() != null) {
                        touch(boards, changed, new Board("REGION", venue.regionId(), sportId, venue.countryId()), participant.userId());
                    }
                    if (venue.countryId() != null) {
                        touch(boards, changed, new Board("COUNTRY", venue.countryId(), sportId, venue.countryId()), participant.userId());
                    }
                }
            }
            if (h2h != null && isTwoPairs(game)) {
                h2h.addGame(numbersOf(game.facts().teams().get(0), numbers), numbersOf(game.facts().teams().get(1), numbers),
                        outcomeOfFirstTeam(game), stats.allowDraws());
            }
        }

        // SESSION-82: +1 session for each player the sport's rule counts. Own totals and the group member row follow the rule;
        // the ranked, region and country counters only count a session in which the player had a ranking game.
        int sessionsCounted = 0;
        for (UUID player : sessionPlayers) {
            if (alreadyCounted.contains(player)) {
                continue;
            }
            sessionsCounted++;
            PlayerStatsDoc doc = players.get(player);
            doc.personal().all().addSession(stats.collected());
            if (rankingPlayers.contains(player)) {
                doc.personal().ranked().addSession(stats.collected());
                if (venue.regionId() != null) {
                    doc.scope("REGION", venue.countryId(), venue.regionId()).counters().addSession(stats.collected());
                }
                if (venue.countryId() != null) {
                    doc.scope("COUNTRY", venue.countryId(), null).counters().addSession(stats.collected());
                }
            }
            if (groupId != null) {
                members.get(player).counters().addSession(stats.collected());
                touch(boards, changed, new Board("GROUP", groupId, sportId, null), player);
            }
        }

        userRows.forEach((id, row) -> {
            players.get(id).writeTo(row);
            userStatsRepository.save(row);
        });
        groupRows.forEach((id, row) -> {
            members.get(id).writeTo(row);
            groupMemberStatsRepository.save(row);
        });
        if (h2hRow != null) {
            h2h.writeTo(h2hRow);
            groupStatsRepository.save(h2hRow);
        }
        markBoardsDirty(boards, now);
        recordChanges(changed);
        return new Applied(counted, sessionsCounted);
    }

    /** Notes that this player's entry on this board changed (and that the board is touched). */
    private void touch(Set<Board> boards, Map<Board, Set<UUID>> changed, Board board, UUID userId) {
        boards.add(board);
        changed.computeIfAbsent(board, b -> new TreeSet<>(Comparator.comparing(UUID::toString))).add(userId);
    }

    /**
     * SESSION-54: appends one change row per player and board, in this counting transaction (an append-only insert takes no lock
     * another session waits on). The ranking job reads them, up to a cutoff, and rebuilds those players' entries.
     */
    private void recordChanges(Map<Board, Set<UUID>> changed) {
        List<StatBoardChange> rows = new ArrayList<>();
        changed.forEach((board, users) -> users.forEach(
                user -> rows.add(new StatBoardChange(board.sportId(), board.scopeType(), board.scopeId(), user))));
        if (!rows.isEmpty()) {
            changeRepository.saveAll(rows);
        }
    }

    /** A game of two teams of exactly two players: the only game the head-to-head counts. */
    private boolean isTwoPairs(Game game) {
        List<List<UUID>> teams = game.facts().teams();
        return teams.size() == 2 && teams.get(0).size() == 2 && teams.get(1).size() == 2;
    }

    /** How the game ended for the first team, from the outcome of its first player. */
    private RecordFacts.Outcome outcomeOfFirstTeam(Game game) {
        return game.facts().participants().stream().filter(p -> p.team() == 0).map(RecordFacts.Participant::outcome)
                .findFirst().orElse(RecordFacts.Outcome.NONE);
    }

    /**
     * The group keys of one player in one game, by dimension, for the grouping the sport's schema asks for: {@code PARTNER}
     * (each other member of the team) or {@code TEAM} (every team of the schema's size the player is in).
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

    /**
     * The same group keys as a group's rows keep them (SESSION-81): a partner is the partner's member number, a team the
     * members' numbers sorted and joined by commas. (A player's own rows keep the user ids: their partners come from many groups.)
     */
    private Map<String, List<String>> memberKeys(Map<String, List<String>> groups, Map<UUID, Integer> numbers) {
        Map<String, List<String>> converted = new LinkedHashMap<>();
        groups.forEach((by, keys) -> {
            List<String> list = new ArrayList<>();
            for (String key : keys) {
                List<Integer> parts = new ArrayList<>();
                for (String id : key.split(",")) {
                    parts.add(numbers.get(UUID.fromString(id)));
                }
                parts.sort(null);
                list.add(parts.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            converted.put(by, list);
        });
        return converted;
    }

    private static List<Integer> numbersOf(List<UUID> team, Map<UUID, Integer> numbers) {
        return team.stream().map(numbers::get).toList();
    }

    /** Adds one player's game to the counters of each of their groups. */
    private void addToGroups(Map<String, List<String>> groups, BiFunction<String, String, StatsCounters> counters,
                             RecordFacts.Participant p, StatisticsSchema stats) {
        groups.forEach((by, keys) -> keys.forEach(key -> counters.apply(by, key).add(p.outcome(), p.metrics(), stats.collectedForCombos())));
    }

    /** The counters of one player for one game: personal, every group of their team, and the venue's scopes (ranking games). */
    private void countPlayer(PlayerStatsDoc doc, RecordFacts.Participant p, Map<String, List<String>> groups, boolean ranking,
                             StatisticsSchema stats, Venue venue) {
        doc.personal().all().add(p.outcome(), p.metrics(), stats.collected());
        addToGroups(groups, (by, key) -> doc.group(by, key).all(), p, stats);
        if (!ranking) {
            return;
        }
        doc.personal().ranked().add(p.outcome(), p.metrics(), stats.collected());
        addToGroups(groups, (by, key) -> doc.group(by, key).ranked(), p, stats);
        if (venue.regionId() != null) {
            PlayerStatsDoc.Scope region = doc.scope("REGION", venue.countryId(), venue.regionId());
            region.counters().add(p.outcome(), p.metrics(), stats.collected());
            addToGroups(groups, region::group, p, stats);
        }
        if (venue.countryId() != null) {
            PlayerStatsDoc.Scope country = doc.scope("COUNTRY", venue.countryId(), null);
            country.counters().add(p.outcome(), p.metrics(), stats.collected());
            addToGroups(groups, country::group, p, stats);
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
        Set<UUID> existing = new HashSet<>(groupMemberStatsRepository.findExistingUserIds(groupId, sportId, users));
        for (UUID user : users) {
            if (!existing.contains(user)) {
                try {
                    writer.ensureGroupRow(groupId, user, sportId);
                } catch (DataIntegrityViolationException e) {
                    log.info("Group statistics row race absorbed: group {} user {} sport {}", groupId, user, sportId);
                }
            }
        }
        return groupMemberStatsRepository.lockAll(groupId, sportId, users).stream()
                .collect(Collectors.toMap(GroupMemberStats::getUserId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    /** The group's head-to-head row, created if missing (its own small transaction) and then locked: the last lock taken. */
    private GroupStats lockGroupStatsRow(Long groupId, Long sportId) {
        try {
            writer.ensureGroupStatsRow(groupId, sportId);
        } catch (DataIntegrityViolationException e) {
            log.info("Group head-to-head row race absorbed: group {} sport {}", groupId, sportId);
        }
        return groupStatsRepository.lockOne(groupId, sportId).orElseThrow();
    }

    /** Marks each touched board dirty, boards in one sorted order so two sessions touching the same boards cannot deadlock. */
    private void markBoardsDirty(Set<Board> boards, Instant now) {
        for (Board board : boards) {
            try {
                writer.ensureBoardRun(board.sportId(), board.scopeType(), board.scopeId(), board.countryId());
            } catch (DataIntegrityViolationException e) {
                log.info("Board run row race absorbed: {} {}", board.scopeType(), board.scopeId());
            }
            if (board.countryId() != null) {
                boardRunRepository.fillCountry(board.sportId(), board.scopeType(), board.scopeId(), board.countryId());
            }
            boardRunRepository.markDirty(board.sportId(), board.scopeType(), board.scopeId(), now);
        }
    }

    /** A game that was counted, and whether it counted as a ranking game: the same mark as the history pointer's. */
    private record CountedGame(long recordId, boolean ranking) {
    }

    /** SESSION-82: what one session's counting changed: the games counted and the players counted for the session itself. */
    private record Applied(List<CountedGame> counted, int sessions) {
    }

    private Result finish(SessionStatsJob job, Instant now, List<CountedGame> counted, List<Ignored> ignored,
                          List<String> notes) {
        return finish(job, now, counted, ignored, notes, 0);
    }

    /** @param sessions SESSION-82: the players counted for the session itself (the {@code sessions} stat); a session with only those is {@code DONE} too */
    private Result finish(SessionStatsJob job, Instant now, List<CountedGame> counted, List<Ignored> ignored,
                          List<String> notes, int sessions) {
        Map<String, Object> result = new LinkedHashMap<>();
        // Compact entries (the same format as the history): counted as "<0|1>-<recordId>", ignored as "<recordId>:<REASON>".
        result.put("counted", counted.stream().map(c -> (Object) StatsHistory.entry(c.recordId(), c.ranking())).toList());
        result.put("ignored", ignored.stream().map(i -> (Object) (i.recordId() + ":" + i.reason())).toList());
        result.put("notes", notes);
        result.put("sessions", sessions);
        SessionStatsJob.Status status = counted.isEmpty() && sessions == 0 ? SessionStatsJob.Status.SKIPPED : SessionStatsJob.Status.DONE;
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
