package com.sportconnect.session.stats;

import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.RecordFacts;
import com.sportconnect.session.stats.SessionGames.Game;
import com.sportconnect.session.stats.SessionGames.Ignored;
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

    /** A board a game touched; SESSION-54 ranks it. {@code countryId} is a region board's country, a country board's own id, none for a group. */
    private record Board(String scopeType, Long scopeId, Long sportId, Long countryId) {
    }

    private final SessionStatsJobRepository jobRepository;
    private final SessionRepository sessionRepository;
    private final RecordReaders readers;
    // SESSION-55: reads a session's games, shared with the seasons' own counting.
    private final SessionGames sessionGames;
    // SESSION-55: counts the session into the seasons that want it.
    private final SeasonStatsCounter seasonCounter;
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
        Result result = countIntoGroupAndPlayers(sessionId, claimedAt);
        // SESSION-55: the seasons that want this session count it in this same transaction (a failure retries the session like any other).
        // Independent of the group's statistics switch: a season keeps counting when the group switches its statistics off.
        sessionRepository.findById(sessionId).ifPresent(seasonCounter::countSession);
        return result;
    }

    /** The counting of SESSION-53 to 84: the players' rows, the group's rows and the boards they touch; the job row is finished here. */
    private Result countIntoGroupAndPlayers(Long sessionId, Instant claimedAt) {
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

        SessionGames.Read read = sessionGames.read(session, schema, reader);
        Set<UUID> joined = read.joined();
        // SESSION-82: a revived job row (the second line of defence) must not count the session's players a second time
        int priorSessions = job.getResult() != null && job.getResult().get("sessions") instanceof Number n ? Math.max(0, n.intValue()) : 0;
        // SESSION-82: a sport whose `sessions` rule counts a joined player without a game still counts a session with no games
        // SESSION-83: the group row of a group session with its switch on may follow the group's own config instead of the sport's
        GroupSessionSettings groupSettings = session.getGroupId() == null ? null
                : groupSettingsRepository.findById(session.getGroupId()).filter(GroupSessionSettings::isStatisticsEnabled).orElse(null);
        StatisticsSchema groupView = groupSettings == null ? null : stats.forGroup(groupSettings.getStatsConfig());   // SESSION-84: the group's own stat list
        boolean groupCollectsSessions = groupView != null && groupView.collectsSessions();
        StatisticsSchema.SessionsRule groupRule = groupView == null ? stats.sessionsRule() : groupView.sessionsRule();
        boolean sessionsWithoutGames = priorSessions == 0 && ((stats.collectsSessions() && stats.sessionsRule().counts(true, false)) || (groupCollectsSessions && groupRule.counts(true, false))) && !joined.isEmpty();
        if (read.noRecords() && !sessionsWithoutGames) {
            return finish(job, now, List.of(), List.of(), List.of("NO_RECORDS"), priorSessions);
        }
        List<Game> games = read.games();
        List<Ignored> ignored = new ArrayList<>(read.ignored());
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
        Set<UUID> groupSessionPlayers = new TreeSet<>(Comparator.comparing(UUID::toString));
        if ((stats.collectsSessions() || groupCollectsSessions) && priorSessions == 0) {
            for (UUID player : joined) {
                if (stats.collectsSessions() && stats.sessionsRule().counts(true, gamePlayers.contains(player))) {
                    sessionPlayers.add(player);
                }
                if (groupCollectsSessions && groupRule.counts(true, gamePlayers.contains(player))) {
                    groupSessionPlayers.add(player);
                }
            }
        }
        if (games.isEmpty() && sessionPlayers.isEmpty() && groupSessionPlayers.isEmpty()) {
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
        Applied applied = apply(session, stats, games, venue, ignored, now, sessionPlayers, groupSessionPlayers, rankingPlayers,
                groupSettings == null ? null : session.getGroupId(), groupView);
        return finish(job, now, applied.counted(), ignored, notes, priorSessions + applied.sessions());
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
                             List<Ignored> ignored, Instant now, Set<UUID> sessionPlayers, Set<UUID> groupSessionPlayers,
                             Set<UUID> rankingPlayers, Long groupId, StatisticsSchema groupView) {
        Long sportId = session.getSportId();
        // SESSION-78: a group session is counted into the group's own rows (member statistics, head-to-head, the GROUP board) only
        // while the group has its switch on (read in process(), at counting time); the players' own statistics are counted either way.
        Set<UUID> users = new TreeSet<>(Comparator.comparing(UUID::toString));
        games.forEach(game -> users.addAll(game.facts().players()));
        users.addAll(sessionPlayers);
        // SESSION-83: the group rows are only those of the players the group counts (a game, or a session by the group's own rule)
        Set<UUID> groupUsers = new TreeSet<>(Comparator.comparing(UUID::toString));
        if (groupId != null) {
            games.forEach(game -> groupUsers.addAll(game.facts().players()));
            groupUsers.addAll(groupSessionPlayers);
        }
        // SESSION-81: a group's rows name its members by the group's permanent member numbers, not by user id. They are read (and
        // allocated, in a short transaction of their own) before anything is locked; a sport with no grouping needs none.
        Map<UUID, Integer> numbers = groupId != null && !stats.groupBy().isEmpty()
                ? memberNumbers.getMemberNumbers(groupId, groupUsers) : Map.of();

        // The one lock order: user rows, then group-member rows, then the group's own row, each table in one ordered pass.
        Map<UUID, UserSportStats> userRows = lockUserRows(sportId, users);
        Map<UUID, PlayerStatsDoc> players = new LinkedHashMap<>();
        userRows.forEach((id, row) -> players.put(id, PlayerStatsDoc.read(row)));
        Map<UUID, GroupMemberStats> groupRows = groupId == null ? Map.of() : lockGroupRows(groupId, sportId, groupUsers);
        Map<UUID, GroupStatsDoc> members = new LinkedHashMap<>();
        groupRows.forEach((id, row) -> members.put(id, GroupStatsDoc.read(row)));
        boolean headToHead = groupId != null && stats.groupsByPartner() && games.stream().anyMatch(g -> GameCounting.isTwoPairs(g.facts()));
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
                Map<String, List<String>> groups = GameCounting.groupKeys(stats, participant.userId(), team);
                PlayerStatsDoc doc = players.get(participant.userId());
                countPlayer(doc, participant, groups, game.ranking(), stats, venue);
                doc.addPointer(recordId, game.ranking());
                if (groupId != null) {
                    GroupStatsDoc member = members.get(participant.userId());
                    member.counters().add(participant.outcome(), participant.metrics(), groupView.collected());
                    GameCounting.addToGroups(GameCounting.memberKeys(groups, numbers), member::group, participant, groupView);
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
            if (h2h != null && GameCounting.isTwoPairs(game.facts())) {
                h2h.addGame(GameCounting.numbersOf(game.facts().teams().get(0), numbers), GameCounting.numbersOf(game.facts().teams().get(1), numbers),
                        GameCounting.outcomeOfFirstTeam(game.facts()), stats.allowDraws());
            }
        }

        // SESSION-82: +1 session for each player the sport's rule counts. Own totals and the group member row follow the rule;
        // the ranked, region and country counters only count a session in which the player had a ranking game.
        Set<UUID> countedForSession = new TreeSet<>(Comparator.comparing(UUID::toString));
        for (UUID player : sessionPlayers) {
            if (alreadyCounted.contains(player)) {
                continue;
            }
            countedForSession.add(player);
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
        }
        // SESSION-83: the group member row follows the group's own rule when it has one, and nothing when the group switched the stat off
        if (groupId != null) {
            for (UUID player : groupSessionPlayers) {
                if (alreadyCounted.contains(player)) {
                    continue;
                }
                countedForSession.add(player);
                members.get(player).counters().addSession(groupView.collected());
                touch(boards, changed, new Board("GROUP", groupId, sportId, null), player);
            }
        }
        int sessionsCounted = countedForSession.size();

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

    /** The counters of one player for one game: personal, every group of their team, and the venue's scopes (ranking games). */
    private void countPlayer(PlayerStatsDoc doc, RecordFacts.Participant p, Map<String, List<String>> groups, boolean ranking,
                             StatisticsSchema stats, Venue venue) {
        doc.personal().all().add(p.outcome(), p.metrics(), stats.collected());
        GameCounting.addToGroups(groups, (by, key) -> doc.group(by, key).all(), p, stats);
        if (!ranking) {
            return;
        }
        doc.personal().ranked().add(p.outcome(), p.metrics(), stats.collected());
        GameCounting.addToGroups(groups, (by, key) -> doc.group(by, key).ranked(), p, stats);
        if (venue.regionId() != null) {
            PlayerStatsDoc.Scope region = doc.scope("REGION", venue.countryId(), venue.regionId());
            region.counters().add(p.outcome(), p.metrics(), stats.collected());
            GameCounting.addToGroups(groups, region::group, p, stats);
        }
        if (venue.countryId() != null) {
            PlayerStatsDoc.Scope country = doc.scope("COUNTRY", venue.countryId(), null);
            country.counters().add(p.outcome(), p.metrics(), stats.collected());
            GameCounting.addToGroups(groups, country::group, p, stats);
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
