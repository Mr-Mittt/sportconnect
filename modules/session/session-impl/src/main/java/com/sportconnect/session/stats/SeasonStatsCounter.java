package com.sportconnect.session.stats;

import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.record.RecordReaders;
import com.sportconnect.session.record.RecordTypeReader;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.season.GroupSeason;
import com.sportconnect.session.season.GroupSeasonRepository;
import com.sportconnect.session.season.GroupSeasonSession;
import com.sportconnect.session.season.GroupSeasonSessionRepository;
import com.sportconnect.session.season.SeasonDates;
import com.sportconnect.session.season.SeasonRowLock;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-55 slice 2: counts a completed group session into the seasons that want it, and takes it back out of a season it is unlinked from.
 *
 * <p><b>Which seasons want a session.</b> A season that is {@code ONGOING} or {@code COMPLETED} (a {@code SCHEDULED} one has not started, a
 * {@code FINALISED} or {@code CANCELLED} one no longer counts) of the session's group, and either AUTO with the session's start inside
 * {@code [start_at, end_at)}, or MANUAL with the session linked. The statistics engine calls {@link #countSession} in its own counting
 * transaction (so a failure here retries the session like any other); finalising and linking call {@link #countInto} directly.
 *
 * <p><b>What it counts.</b> The games {@link SessionGames} reads, into the season's own rows ({@link SeasonMemberStats}, {@link SeasonStats})
 * exactly as the group's member row and head-to-head are counted (same code in {@link GameCounting}), through the <b>season's</b> stat list
 * and its own {@code sessions} rule, whether or not the group's statistics switch is on (a season keeps counting when the group switches
 * them off). A season has no ranked split.
 *
 * <p><b>The ledger and the two directions.</b> {@code group_seasons.counted_sessions} remembers, per session, the records counted and the
 * players given a {@code sessions} count. Adding a session already in it does nothing (idempotent); removing a session subtracts exactly its
 * entry (the same games counted into blank rows, taken off the real ones; a partner or head-to-head entry left empty is deleted; the history
 * loses the pointers). The counters are sums and counts, so the subtraction is exact; the games are frozen by then (a swept session is only
 * counted at finalise, after which links are locked).
 *
 * <p><b>Locks.</b> The season's row ({@code FOR UPDATE}) is taken first and serialises everything that changes the season's rows, so a missing
 * member row is simply created in the same transaction (no {@code REQUIRES_NEW}: a second transaction inserting a child row would wait on the
 * parent's lock the first one holds). After it, the member rows in one ordered statement, then the head-to-head row. The engine takes them
 * after its own user and group rows, the other callers take only these, so the order is consistent.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeasonStatsCounter {

    private static final Set<SeasonStatus> COUNTING = EnumSet.of(SeasonStatus.ONGOING, SeasonStatus.COMPLETED);

    private final GroupSeasonRepository seasonRepository;
    private final SeasonRowLock rowLock;
    private final GroupSeasonSessionRepository linkRepository;
    private final SessionRepository sessionRepository;
    private final SeasonMemberStatsRepository memberRepository;
    private final SeasonStatsRepository statsRepository;
    private final SessionGames sessionGames;
    private final RecordReaders readers;
    private final SportService sportService;
    private final GroupMemberNumberService memberNumbers;

    /** What reading one session needs, once for every season that counts it. */
    private record Reading(Session session, StatisticsSchema stats, SessionGames.Read read) {
    }

    // ---- the engine and the sweep: count a session into every season that wants it -----------------------------------------

    /**
     * Counts a completed group session into every season that wants it and has not counted it yet. Runs in the caller's transaction.
     *
     * @return how many seasons counted it
     */
    @Transactional
    public int countSession(Session session) {
        if (session.getGroupId() == null || session.getStatus() != SessionStatus.COMPLETED) {
            return 0;
        }
        List<Long> seasonIds = seasonsWanting(session);
        if (seasonIds.isEmpty()) {
            return 0;
        }
        Reading reading = reading(session);
        if (reading == null) {
            return 0;
        }
        int counted = 0;
        for (Long seasonId : seasonIds) {
            GroupSeason season = rowLock.lock(seasonId).orElse(null);
            // re-checked under the lock: a season cancelled or finalised a moment ago no longer counts
            if (season != null && wants(season, session) && countInto(season, reading)) {
                counted++;
            }
        }
        return counted;
    }

    /** The ids of the seasons that want this session, in id order (the order their rows are locked in). */
    private List<Long> seasonsWanting(Session session) {
        Set<Long> ids = new TreeSet<>();
        seasonRepository.findAutoSeasonsContaining(session.getGroupId(), COUNTING, SeasonCollectionMode.AUTO, session.getScheduledStart())
                .forEach(season -> ids.add(season.getId()));
        List<Long> linked = linkRepository.findBySessionId(session.getId()).stream().map(GroupSeasonSession::getSeasonId).toList();
        if (!linked.isEmpty()) {
            seasonRepository.findAllById(linked).stream()
                    .filter(season -> season.getCollectionMode() == SeasonCollectionMode.MANUAL
                            && season.getGroupId().equals(session.getGroupId()))
                    .forEach(season -> ids.add(season.getId()));
        }
        return new ArrayList<>(ids);
    }

    /** Whether a locked season still wants the session: it counts, is the session's group's, and the session is in its range (AUTO) or linked (MANUAL). */
    private boolean wants(GroupSeason season, Session session) {
        if (!COUNTING.contains(season.getStatus()) || !season.getGroupId().equals(session.getGroupId())
                || !SeasonDates.contains(season.getStartAt(), season.getEndAt(), session.getScheduledStart())) {
            return false;
        }
        return season.getCollectionMode() == SeasonCollectionMode.AUTO
                || linkRepository.existsById(new GroupSeasonSession.Key(season.getId(), session.getId()));
    }

    /**
     * Counts a session into one season whose row the caller has locked, from a fresh read. For finalising and linking, which count one
     * season; the engine reads once for several seasons through {@link #countSession}.
     *
     * @return {@code false} when the season already counted the session (the ledger) or the sport has nothing to read it with
     */
    @Transactional
    public boolean countInto(GroupSeason season, Session session) {
        Reading reading = reading(session);
        return reading != null && countInto(season, reading);
    }

    private boolean countInto(GroupSeason season, Reading reading) {
        Session session = reading.session();
        String ledgerKey = String.valueOf(session.getId());
        if (season.getCountedSessions().containsKey(ledgerKey)) {
            return false;
        }
        StatisticsSchema view = reading.stats().forGroup(season.getStatsConfig());
        List<SessionGames.Game> games = reading.read().games();
        Set<UUID> sessionPlayers = sessionPlayers(view, reading.read().joined(), games);
        Set<UUID> users = playersOf(games, sessionPlayers);

        if (!users.isEmpty()) {
            Map<UUID, Integer> numbers = reading.stats().groupBy().isEmpty() ? Map.of()
                    : memberNumbers.getMemberNumbers(season.getGroupId(), users);
            Map<UUID, SeasonMemberStats> rows = lockMemberRows(season.getId(), users);
            Map<UUID, GroupStatsDoc> members = new LinkedHashMap<>();
            rows.forEach((id, row) -> members.put(id, GroupStatsDoc.read(row)));
            boolean headToHead = reading.stats().groupsByPartner() && games.stream().anyMatch(g -> GameCounting.isTwoPairs(g.facts()));
            SeasonStats h2hRow = headToHead ? lockStatsRow(season.getId()) : null;
            GroupH2hDoc h2h = h2hRow == null ? null : GroupH2hDoc.read(h2hRow);

            apply(reading.stats(), view, games, sessionPlayers, numbers, members, h2h, true);

            rows.forEach((id, row) -> {
                members.get(id).writeTo(row);
                memberRepository.save(row);
            });
            if (h2hRow != null) {
                h2h.writeTo(h2hRow);
                statsRepository.save(h2hRow);
            }
        }
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("g", games.stream().map(g -> (Object) g.record().getId()).toList());
        entry.put("p", sessionPlayers.stream().map(UUID::toString).map(id -> (Object) id).toList());
        Map<String, Object> ledger = new LinkedHashMap<>(season.getCountedSessions());
        ledger.put(ledgerKey, entry);
        season.setCountedSessions(ledger);
        seasonRepository.save(season);
        log.info("Session {} counted into season {} ({} games, {} players)", session.getId(), season.getId(), games.size(), users.size());
        return true;
    }

    // ---- removing a linked session ---------------------------------------------------------------------------------------------

    /**
     * Takes sessions back out of a season whose row the caller has locked: subtracts exactly what the ledger says each one counted, <b>all of
     * them in one pass</b>. Every removed session is counted into the same blank rows (the counters are sums and counts, so the contributions
     * add up), then those rows are subtracted from the real ones once: the member rows are locked, read and written once however many sessions
     * go, and the head-to-head likewise. A session the season never counted is skipped (nothing to take out), one that cannot be read any more is
     * logged and keeps its ledger entry, the others are taken out.
     *
     * @return how many sessions were taken out
     */
    @Transactional
    public int removeFrom(GroupSeason season, Collection<Long> sessionIds) {
        Set<Long> removed = new LinkedHashSet<>();
        Set<Long> recordIds = new LinkedHashSet<>();
        Set<UUID> users = new TreeSet<>(Comparator.comparing(UUID::toString));
        Map<UUID, GroupStatsDoc> scratch = new TreeMap<>(Comparator.comparing(UUID::toString));
        GroupH2hDoc scratchH2h = null;
        for (Long sessionId : sessionIds) {
            Object entryNode = season.getCountedSessions().get(String.valueOf(sessionId));
            if (!(entryNode instanceof Map<?, ?> entry)) {
                continue;
            }
            Set<Long> sessionRecords = new LinkedHashSet<>();
            if (entry.get("g") instanceof List<?> list) {
                list.forEach(value -> sessionRecords.add(((Number) value).longValue()));
            }
            Set<UUID> sessionPlayers = new TreeSet<>(Comparator.comparing(UUID::toString));
            if (entry.get("p") instanceof List<?> list) {
                list.forEach(value -> sessionPlayers.add(UUID.fromString(String.valueOf(value))));
            }
            Session session = sessionRepository.findById(sessionId).orElse(null);
            Reading reading = session == null ? null : reading(session);
            if (reading == null) {
                // cannot read the session any more: the counted numbers cannot be taken off, so say so loudly and keep the ledger entry
                log.error("Season {}: session {} cannot be read, its counted games were not taken out", season.getId(), sessionId);
                continue;
            }
            List<SessionGames.Game> games = reading.read().games().stream()
                    .filter(game -> sessionRecords.contains(game.record().getId())).toList();
            if (games.size() != sessionRecords.size()) {
                log.warn("Season {}: session {} has {} of its {} counted records left to subtract", season.getId(), sessionId,
                        games.size(), sessionRecords.size());
            }
            StatisticsSchema view = reading.stats().forGroup(season.getStatsConfig());
            Set<UUID> sessionUsers = playersOf(games, sessionPlayers);
            Map<UUID, Integer> numbers = sessionUsers.isEmpty() || reading.stats().groupBy().isEmpty() ? Map.of()
                    : memberNumbers.getMemberNumbers(season.getGroupId(), sessionUsers);
            // the same games counted into blank rows, shared by every removed session: exactly what they added together
            sessionUsers.forEach(user -> scratch.computeIfAbsent(user,
                    id -> GroupStatsDoc.read(new SeasonMemberStats(season.getId(), id))));
            boolean headToHead = reading.stats().groupsByPartner() && games.stream().anyMatch(g -> GameCounting.isTwoPairs(g.facts()));
            if (headToHead && scratchH2h == null) {
                scratchH2h = GroupH2hDoc.read(new SeasonStats(season.getId()));
            }
            apply(reading.stats(), view, games, sessionPlayers, numbers, scratch, headToHead ? scratchH2h : null, false);
            users.addAll(sessionUsers);
            recordIds.addAll(sessionRecords);
            removed.add(sessionId);
        }
        if (removed.isEmpty()) {
            return 0;
        }
        if (!users.isEmpty()) {
            Map<UUID, SeasonMemberStats> rows = lockExistingMemberRows(season.getId(), users);
            rows.forEach((id, row) -> {
                GroupStatsDoc doc = GroupStatsDoc.read(row);
                doc.subtract(scratch.get(id), recordIds);
                doc.writeTo(row);
                memberRepository.save(row);
            });
        }
        if (scratchH2h != null) {
            GroupH2hDoc gone = scratchH2h;
            statsRepository.lockOne(season.getId()).ifPresent(h2hRow -> {
                GroupH2hDoc h2h = GroupH2hDoc.read(h2hRow);
                h2h.subtract(gone);
                h2h.writeTo(h2hRow);
                statsRepository.save(h2hRow);
            });
        }
        Map<String, Object> ledger = new LinkedHashMap<>(season.getCountedSessions());
        removed.forEach(sessionId -> ledger.remove(String.valueOf(sessionId)));
        season.setCountedSessions(ledger);
        seasonRepository.save(season);
        log.info("{} session(s) taken out of season {} ({} games)", removed.size(), season.getId(), recordIds.size());
        return removed.size();
    }

    // ---- the counting itself, the same for adding and for the blank rows a subtraction builds ----------------------------------

    /**
     * Counts the games into the member docs and the head-to-head, the way the engine counts a group session into the group's member row
     * ({@code SessionStatsProcessor.apply}): the member's counters through the season's list, each partner or team through the combo list,
     * the pointer of each record (not for the blank rows of a subtraction), the head-to-head of two pairs, and the {@code sessions} stat.
     */
    private void apply(StatisticsSchema stats, StatisticsSchema view, List<SessionGames.Game> games, Set<UUID> sessionPlayers,
                       Map<UUID, Integer> numbers, Map<UUID, GroupStatsDoc> members, GroupH2hDoc h2h, boolean pointers) {
        for (SessionGames.Game game : games) {
            long recordId = game.record().getId();
            for (var participant : game.facts().participants()) {
                List<UUID> team = game.facts().teams().get(participant.team());
                Map<String, List<String>> groups = GameCounting.groupKeys(stats, participant.userId(), team);
                GroupStatsDoc member = members.get(participant.userId());
                member.counters().add(participant.outcome(), participant.metrics(), view.collected());
                GameCounting.addToGroups(GameCounting.memberKeys(groups, numbers), member::group, participant, view);
                if (pointers) {
                    member.addPointer(recordId, game.ranking());
                }
            }
            if (h2h != null && GameCounting.isTwoPairs(game.facts())) {
                h2h.addGame(GameCounting.numbersOf(game.facts().teams().get(0), numbers),
                        GameCounting.numbersOf(game.facts().teams().get(1), numbers),
                        GameCounting.outcomeOfFirstTeam(game.facts()), stats.allowDraws());
            }
        }
        for (UUID player : sessionPlayers) {
            members.get(player).counters().addSession(view.collected());
        }
    }

    /** Who gets +1 in the {@code sessions} stat by the season's own rule (joined players; a player with a game counts as having one). */
    private static Set<UUID> sessionPlayers(StatisticsSchema view, Set<UUID> joined, List<SessionGames.Game> games) {
        Set<UUID> result = new TreeSet<>(Comparator.comparing(UUID::toString));
        if (!view.collectsSessions()) {
            return result;
        }
        Set<UUID> gamePlayers = new HashSet<>();
        games.forEach(game -> gamePlayers.addAll(game.facts().players()));
        for (UUID player : joined) {
            if (view.sessionsRule().counts(true, gamePlayers.contains(player))) {
                result.add(player);
            }
        }
        return result;
    }

    private static Set<UUID> playersOf(List<SessionGames.Game> games, Collection<UUID> sessionPlayers) {
        Set<UUID> users = new TreeSet<>(Comparator.comparing(UUID::toString));
        games.forEach(game -> users.addAll(game.facts().players()));
        users.addAll(sessionPlayers);
        return users;
    }

    // ---- reading and locking -------------------------------------------------------------------------------------------------------

    /** The session's games through its sport's reader, or {@code null} when the sport has statistics off or no reader for its schema. */
    private Reading reading(Session session) {
        if (session.getSportId() == null || !sportService.isStatisticsEnabled(session.getSportId())) {
            return null;
        }
        Map<String, Object> schema;
        try {
            schema = sportService.getResultSchema(session.getSportId());
        } catch (ResourceNotFoundException e) {
            return null;
        }
        RecordTypeReader reader = schema == null ? null : readers.forSchema(schema).orElse(null);
        if (reader == null) {
            return null;
        }
        StatisticsSchema stats = StatisticsSchema.of(schema);
        return stats.collects() ? new Reading(session, stats, sessionGames.read(session, schema, reader)) : null;
    }

    /** Creates the missing member rows (in this transaction: the season's row lock serialises every writer) and locks them all in one ordered statement. */
    private Map<UUID, SeasonMemberStats> lockMemberRows(Long seasonId, Set<UUID> users) {
        Set<UUID> existing = new HashSet<>(memberRepository.findExistingUserIds(seasonId, users));
        for (UUID user : users) {
            if (!existing.contains(user)) {
                memberRepository.saveAndFlush(new SeasonMemberStats(seasonId, user));
            }
        }
        return memberRepository.lockAll(seasonId, users).stream()
                .collect(Collectors.toMap(SeasonMemberStats::getUserId, row -> row, (a, b) -> a, LinkedHashMap::new));
    }

    private Map<UUID, SeasonMemberStats> lockExistingMemberRows(Long seasonId, Set<UUID> users) {
        return memberRepository.lockAll(seasonId, users).stream()
                .collect(Collectors.toMap(SeasonMemberStats::getUserId, row -> row, (a, b) -> a, LinkedHashMap::new));
    }

    private SeasonStats lockStatsRow(Long seasonId) {
        if (!statsRepository.existsById(seasonId)) {
            statsRepository.saveAndFlush(new SeasonStats(seasonId));
        }
        return statsRepository.lockOne(seasonId).orElseThrow();
    }
}
