package com.sportconnect.session.stats;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.GroupMemberStatisticsResponse;
import com.sportconnect.session.api.dto.GroupStatisticsMemberDto;
import com.sportconnect.session.api.dto.GroupStatisticsResponse;
import com.sportconnect.session.api.dto.PlayerStatisticsResponse;
import com.sportconnect.session.api.dto.StatsGameDto;
import com.sportconnect.session.api.dto.StatsGameTeamDto;
import com.sportconnect.session.api.dto.StatsGamesPageResponse;
import com.sportconnect.session.api.dto.StatsGroupDto;
import com.sportconnect.session.api.dto.StatsPlayerDto;
import com.sportconnect.session.api.dto.StatsScopeDto;
import com.sportconnect.session.api.dto.StatsSplitDto;
import com.sportconnect.session.api.service.SessionStatisticsService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.record.RecordFacts;
import com.sportconnect.session.record.RecordReaders;
import com.sportconnect.session.record.RecordTypeReader;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.ToLongFunction;
import java.util.stream.Collectors;

/**
 * SESSION-73: the read side of the statistics. Everything here is a read of the rows the engine ({@link SessionStatsProcessor})
 * writes, shown through the sport's schema ({@link StatisticsSchema}); nothing is counted, ranked or changed. The shapes read
 * are documented in {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 *
 * <p>Names always come from the display lookup ({@code getUserSummariesByIds}: a deactivated account keeps its name); the one
 * active-only lookup is the group list, which decides who is <em>listed</em> ({@code getActiveUserIds}).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionStatisticsServiceImpl implements SessionStatisticsService {

    /** The most rows a list or games page returns. */
    static final int MAX_PAGE = 50;

    private final SportService sportService;
    private final GroupService groupService;
    // SESSION-81: a group's rows name the members by the group's member numbers; this turns them back into user ids.
    private final GroupMemberNumberService memberNumberService;
    private final UserService userService;
    private final UserSportStatsRepository userStatsRepository;
    private final GroupMemberStatsRepository groupStatsRepository;
    private final SessionRecordRepository recordRepository;
    private final SessionRepository sessionRepository;
    private final RecordReaders recordReaders;
    // SESSION-84: a group's own stat list decides the columns and values its endpoints answer.
    private final com.sportconnect.session.repository.GroupSessionSettingsRepository groupSettingsRepository;

    /**
     * {@inheritDoc}
     *
     * <p>Flow: the sport's schema (404 for a missing or deactivated sport), the one {@code user_sport_stats} row by its primary
     * key (none reads as zeros), the totals, then one batch name lookup for every partner and every member of every pair.
     */
    @Override
    @Transactional(readOnly = true)
    public PlayerStatisticsResponse getMyStatistics(UUID userId, Long sportId, int page, int size) {
        requirePage(page, size);
        StatisticsSchema stats = schemaOf(sportId);
        Optional<UserSportStats> row = userStatsRepository.findById(new UserSportStats.Key(userId, sportId));
        PlayerStatsDoc doc = PlayerStatsDoc.read(row.orElseGet(() -> new UserSportStats(userId, sportId)));

        List<Map.Entry<String, PlayerStatsDoc.AllRanked>> allPairs = declaredGroups(stats.comboSize() > 0,
                doc.groupings().getOrDefault(StatisticsSchema.TEAM, Map.of()), c -> c.all().games(), SessionStatisticsServiceImpl::isUserKey);
        List<Map.Entry<String, PlayerStatsDoc.AllRanked>> allPartners = declaredGroups(stats.groupsByPartner(),
                doc.groupings().getOrDefault(StatisticsSchema.PARTNER, Map.of()), c -> c.all().games(), SessionStatisticsServiceImpl::isUserKey);
        List<Map.Entry<String, PlayerStatsDoc.AllRanked>> pairs = pageOf(allPairs, page, size);
        List<Map.Entry<String, PlayerStatsDoc.AllRanked>> partners = pageOf(allPartners, page, size);
        Set<UUID> ids = new LinkedHashSet<>();
        pairs.forEach(e -> ids.addAll(playersOfKey(e.getKey())));
        partners.forEach(e -> ids.addAll(playersOfKey(e.getKey())));
        Map<UUID, StatsPlayerDto> names = players(ids);

        List<StatsScopeDto> scopes = doc.scopes().stream()
                .sorted(Comparator.comparingLong((PlayerStatsDoc.Scope s) -> s.counters().games()).reversed()
                        .thenComparing(PlayerStatsDoc.Scope::scope))
                .map(s -> new StatsScopeDto(s.scope(), s.countryId(), s.regionId(), stats.valuesOf(s.counters())))
                .toList();
        return new PlayerStatisticsResponse(sportId, stats.columns(), split(stats, doc.personal()),
                groups(stats.forCombos(), pairs, names), allPairs.size(), groups(stats.forCombos(), partners, names), allPartners.size(), scopes,
                row.map(UserSportStats::getUpdatedAt).orElse(null));
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: slice the player's pointers after the cursor, then one {@code findAllById} for the records, one for their
     * sessions and one batch name lookup. A cursor that is no longer in the 500 pointers ends the list (an empty last page).
     * The outcome is read through the sport's current schema; the teams and scores are read from the record itself.
     */
    @Override
    @Transactional(readOnly = true)
    public StatsGamesPageResponse getMyGames(UUID userId, Long sportId, Long cursor, int size) {
        if (size < 1 || size > MAX_PAGE) {
            throw invalid("size must be between 1 and " + MAX_PAGE);
        }
        Map<String, Object> schema = sportService.getResultSchema(sportId);
        Optional<UserSportStats> row = userStatsRepository.findById(new UserSportStats.Key(userId, sportId));
        List<StatsHistory.Pointer> all = row.map(r -> PlayerStatsDoc.read(r).pointers()).orElse(List.of());

        int start = 0;
        if (cursor != null) {
            int at = -1;
            for (int i = 0; i < all.size(); i++) {
                if (all.get(i).recordId() == cursor) {
                    at = i;
                    break;
                }
            }
            if (at < 0) {
                return new StatsGamesPageResponse(List.of(), null);
            }
            start = at + 1;
        }
        int end = Math.min(start + size, all.size());
        List<StatsHistory.Pointer> slice = all.subList(start, end);
        Long nextCursor = end < all.size() && !slice.isEmpty() ? slice.get(slice.size() - 1).recordId() : null;
        if (slice.isEmpty()) {
            return new StatsGamesPageResponse(List.of(), null);
        }

        Map<Long, SessionRecord> records = recordRepository.findAllById(slice.stream().map(StatsHistory.Pointer::recordId).toList())
                .stream().collect(Collectors.toMap(SessionRecord::getId, Function.identity()));
        // The entry carries no session id: it is the record's own, read from the records just loaded.
        Map<Long, Session> sessions = sessionRepository.findAllById(
                        records.values().stream().map(SessionRecord::getSessionId).distinct().toList())
                .stream().collect(Collectors.toMap(Session::getId, Function.identity()));
        Optional<RecordTypeReader> reader = recordReaders.forSchema(schema);

        record Resolved(StatsHistory.Pointer pointer, SessionRecord record, Session session, List<RawTeam> teams) {
        }
        List<Resolved> resolved = new ArrayList<>();
        Set<UUID> ids = new LinkedHashSet<>();
        for (StatsHistory.Pointer pointer : slice) {
            SessionRecord record = records.get(pointer.recordId());
            Session session = record == null ? null : sessions.get(record.getSessionId());
            if (record == null || session == null) {
                continue;
            }
            List<RawTeam> teams = rawTeams(record.getData());
            teams.forEach(t -> ids.addAll(t.players()));
            resolved.add(new Resolved(pointer, record, session, teams));
        }
        Map<UUID, StatsPlayerDto> names = players(ids);

        List<StatsGameDto> games = new ArrayList<>();
        for (Resolved game : resolved) {
            String title = game.session().getTitle() == null || game.session().getTitle().isBlank()
                    ? null : game.session().getTitle();
            List<StatsGameTeamDto> teams = game.teams().stream()
                    .map(t -> new StatsGameTeamDto(t.players().stream().map(id -> player(names, id)).toList(), t.scores()))
                    .toList();
            games.add(new StatsGameDto(game.record().getId(), game.session().getId(), title,
                    game.session().getScheduledStart(), game.pointer().ranking(),
                    outcomeOf(reader, schema, game.record(), userId), teams));
        }
        return new StatsGamesPageResponse(games, nextCursor);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: the member gate first (so a non-member learns nothing from a 404), the sport's schema, one query for the
     * group's rows of the sport, the current members (one call) and, of those with a row, the active ones (one ids-only
     * query); sort, slice one page, one batch name lookup for the page.
     */
    @Override
    @Transactional(readOnly = true)
    public GroupStatisticsResponse getGroupStatistics(Long groupId, UUID callerId, Pageable pageable) {
        requireGroupMember(groupId, callerId);
        Long sportId = groupSportId(groupId, callerId);
        StatisticsSchema stats = groupView(groupId, schemaOf(sportId));

        List<GroupMemberStats> rows = groupStatsRepository.findByGroupIdAndSportId(groupId, sportId);
        Set<UUID> members = new HashSet<>(groupService.getMemberUserIds(groupId));
        List<UUID> candidates = rows.stream().map(GroupMemberStats::getUserId).filter(members::contains).toList();
        Set<UUID> active = candidates.isEmpty() ? Set.of() : userService.getActiveUserIds(candidates);

        record Entry(UUID userId, GroupStatsDoc doc, Instant updatedAt) {
        }
        List<Entry> entries = rows.stream()
                .filter(r -> active.contains(r.getUserId()))        // candidates are the current members, so this is both checks
                .map(r -> new Entry(r.getUserId(), GroupStatsDoc.read(r), r.getUpdatedAt()))
                .sorted(Comparator.comparingLong((Entry e) -> e.doc().counters().games()).reversed()
                        .thenComparing(Comparator.comparingDouble((Entry e) -> wins(e.doc().counters())).reversed())
                        .thenComparing(e -> e.userId().toString()))
                .toList();
        Instant asOf = entries.stream().map(Entry::updatedAt).max(Comparator.naturalOrder()).orElse(null);

        int size = pageable.isPaged() ? Math.min(Math.max(pageable.getPageSize(), 1), MAX_PAGE) : MAX_PAGE;
        int page = pageable.isPaged() ? Math.max(pageable.getPageNumber(), 0) : 0;
        int from = (int) Math.min((long) page * size, entries.size());
        List<Entry> slice = entries.subList(from, Math.min(from + size, entries.size()));
        Map<UUID, StatsPlayerDto> names = players(slice.stream().map(Entry::userId).toList());
        List<GroupStatisticsMemberDto> content = slice.stream()
                .map(e -> new GroupStatisticsMemberDto(player(names, e.userId()), stats.valuesOf(e.doc().counters())))
                .toList();
        Page<GroupStatisticsMemberDto> result = new PageImpl<>(content, PageRequest.of(page, size), entries.size());
        return new GroupStatisticsResponse(sportId, stats.columns(), result, asOf);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: the member gate for the caller, the sport's schema, the one {@code group_member_stats} row by its primary key
     * (none reads as zeros), one batch name lookup for the member and the listed pairs or partners (one page of the pairs or partners;
     * a sport has one grouping only, so one list is empty). The member is not checked: a member who left or was deactivated
     * is shown, as the history of the group.
     */
    @Override
    @Transactional(readOnly = true)
    public GroupMemberStatisticsResponse getGroupMemberStatistics(Long groupId, UUID callerId, UUID memberId,
                                                                  int page, int size) {
        requireGroupMember(groupId, callerId);
        requirePage(page, size);
        Long sportId = groupSportId(groupId, callerId);
        StatisticsSchema stats = groupView(groupId, schemaOf(sportId));
        Optional<GroupMemberStats> row = groupStatsRepository.findById(new GroupMemberStats.Key(groupId, memberId, sportId));
        GroupStatsDoc doc = GroupStatsDoc.read(row.orElseGet(() -> new GroupMemberStats(groupId, memberId, sportId)));

        // A group's rows name the members by the group's member numbers (SESSION-81), not by user id.
        List<Map.Entry<String, StatsCounters>> allPairs = declaredGroups(stats.comboSize() > 0,
                doc.groupings().getOrDefault(StatisticsSchema.TEAM, Map.of()), StatsCounters::games, SessionStatisticsServiceImpl::isNumberKey);
        List<Map.Entry<String, StatsCounters>> allPartners = declaredGroups(stats.groupsByPartner(),
                doc.groupings().getOrDefault(StatisticsSchema.PARTNER, Map.of()), StatsCounters::games, SessionStatisticsServiceImpl::isNumberKey);
        List<Map.Entry<String, StatsCounters>> pairs = pageOf(allPairs, page, size);
        List<Map.Entry<String, StatsCounters>> partners = pageOf(allPartners, page, size);
        // One batch call turns the numbers of the page back into user ids; a number nobody has is left out of that entry.
        Set<Integer> numbers = new LinkedHashSet<>();
        pairs.forEach(e -> numbers.addAll(numbersOfKey(e.getKey())));
        partners.forEach(e -> numbers.addAll(numbersOfKey(e.getKey())));
        Map<Integer, UUID> userOf = numbers.isEmpty() ? Map.of() : memberNumberService.getUserIdsByMemberNumbers(groupId, numbers);
        Function<String, List<UUID>> playersOf = key -> numbersOfKey(key).stream().map(userOf::get).filter(Objects::nonNull).toList();
        Set<UUID> ids = new LinkedHashSet<>();
        ids.add(memberId);
        pairs.forEach(e -> ids.addAll(playersOf.apply(e.getKey())));
        partners.forEach(e -> ids.addAll(playersOf.apply(e.getKey())));
        Map<UUID, StatsPlayerDto> names = players(ids);

        return new GroupMemberStatisticsResponse(sportId, stats.columns(), player(names, memberId),
                stats.valuesOf(doc.counters()), memberEntries(stats.forCombos(), pairs, names, playersOf), allPairs.size(),
                memberEntries(stats.forCombos(), partners, names, playersOf), allPartners.size(), row.map(GroupMemberStats::getUpdatedAt).orElse(null));
    }


    /** SESSION-84: the stat list a group's endpoints answer: the group's own list (its {@code stats_config}) over the sport's current schema. */
    private StatisticsSchema groupView(Long groupId, StatisticsSchema sport) {
        return sport.forGroup(groupSettingsRepository.findById(groupId)
                .map(com.sportconnect.session.entity.GroupSessionSettings::getStatsConfig).orElse(null));
    }
    /** The group's own sport (a group has at most one); a group with none has no statistics (400 SESSION_SPORT_REQUIRED, as for its sessions). */
    private Long groupSportId(Long groupId, UUID callerId) {
        Long sportId = groupService.getGroup(groupId, callerId).getSportId();
        if (sportId == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "This group has no sport, so it has no statistics", null);
        }
        return sportId;
    }

    /** One 403 for a non-member and for a missing or inactive group alike ({@code isGroupMember} is false for both). */
    private void requireGroupMember(Long groupId, UUID userId) {
        if (!groupService.isGroupMember(groupId, userId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED",
                    "Only group members can view this group's statistics", null);
        }
    }

    /**
     * The sport's statistics schema, or an empty one (no columns, no grouping, so nothing is shown) while the sport's statistics
     * switch is off. The switch check also answers 404 {@code SPORT_NOT_FOUND} for a missing or deactivated sport.
     */
    private StatisticsSchema schemaOf(Long sportId) {
        return sportService.isStatisticsEnabled(sportId)
                ? StatisticsSchema.of(sportService.getResultSchema(sportId)) : StatisticsSchema.of(Map.of());
    }

    private static void requirePage(int page, int size) {
        if (page < 0) {
            throw invalid("page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE) {
            throw invalid("size must be between 1 and " + MAX_PAGE);
        }
    }

    /** The wins of a member, 0 when the sport does not collect them. */
    private static double wins(StatsCounters counters) {
        Double wins = counters.value("wins");
        return wins == null ? 0d : wins;
    }

    /** All, ranking and normal values for one subject; normal is all minus ranking (see {@link StatsCounters#minus}). */
    private static StatsSplitDto split(StatisticsSchema stats, PlayerStatsDoc.AllRanked counters) {
        return new StatsSplitDto(stats.valuesOf(counters.all()), stats.valuesOf(counters.ranked()),
                stats.valuesOf(counters.all().minus(counters.ranked())));
    }

    /**
     * Every group of one dimension that holds a player id, most games first (then by key). The stored groups are not capped
     * (a player gains a partner for every new teammate), so a response lists one {@link #pageOf page} of them.
     */
    private static <T> List<Map.Entry<String, T>> mostPlayed(Map<String, T> byKey, ToLongFunction<T> games, Predicate<String> validKey) {
        return byKey.entrySet().stream()
                .filter(e -> validKey.test(e.getKey()))
                .sorted(Comparator.comparingLong((Map.Entry<String, T> e) -> games.applyAsLong(e.getValue())).reversed()
                        .thenComparing(Map.Entry::getKey))
                .toList();
    }

    /**
     * The groups of a dimension only when the sport's CURRENT schema declares it as its grouping (owner, 2026-11-24: grouping
     * is the sport's, and no {@code groupBy} means no grouping at all). Groups stored under another dimension, from before a
     * schema edit, stay in the row but are not shown.
     */
    private static <T> List<Map.Entry<String, T>> declaredGroups(boolean declared, Map<String, T> byKey, ToLongFunction<T> games,
                                                                  Predicate<String> validKey) {
        return declared ? mostPlayed(byKey, games, validKey) : List.of();
    }

    /** A key of a player's own row: one user id, or a team's ids joined by commas. */
    private static boolean isUserKey(String key) {
        return !playersOfKey(key).isEmpty();
    }

    /** A key of a group's row: one member number, or a team's numbers joined by commas. */
    private static boolean isNumberKey(String key) {
        return !numbersOfKey(key).isEmpty();
    }

    /** The member numbers in a group key; empty if any part is not a number. */
    private static List<Integer> numbersOfKey(String key) {
        List<Integer> numbers = new ArrayList<>();
        for (String part : key.split(",")) {
            try {
                numbers.add(Integer.parseInt(part.trim()));
            } catch (NumberFormatException e) {
                return List.of();
            }
        }
        return numbers;
    }

    /** One page of a sorted list (empty past the end): what a response shows, the whole count being in its total. */
    private static <T> List<T> pageOf(List<T> sorted, int page, int size) {
        int from = (int) Math.min((long) page * size, sorted.size());
        return sorted.subList(from, Math.min(from + size, sorted.size()));
    }

    /** A member's pairs, or partners, in a group as the detail shows them, in the order given (one map of values each). */
    private static List<GroupMemberStatisticsResponse.GroupEntryDto> memberEntries(
            StatisticsSchema stats, List<Map.Entry<String, StatsCounters>> entries, Map<UUID, StatsPlayerDto> names,
            Function<String, List<UUID>> playersOf) {
        return entries.stream()
                .map(e -> new GroupMemberStatisticsResponse.GroupEntryDto(
                        playersOf.apply(e.getKey()).stream().map(id -> player(names, id)).toList(),
                        stats.valuesOf(e.getValue())))
                .toList();
    }

    /** The groups of one dimension as a response shows them, in the order given. */
    private static List<StatsGroupDto> groups(StatisticsSchema stats, List<Map.Entry<String, PlayerStatsDoc.AllRanked>> entries,
                                              Map<UUID, StatsPlayerDto> names) {
        return entries.stream()
                .map(e -> new StatsGroupDto(playersOfKey(e.getKey()).stream().map(id -> player(names, id)).toList(),
                        split(stats, e.getValue())))
                .toList();
    }

    /** The player ids in a grouping key (one id, or a team's ids joined by commas); empty if any part is not an id. */
    private static List<UUID> playersOfKey(String key) {
        List<UUID> players = new ArrayList<>();
        for (String part : key.split(",")) {
            try {
                players.add(UUID.fromString(part.trim()));
            } catch (IllegalArgumentException e) {
                return List.of();
            }
        }
        return players;
    }

    /** One batch display lookup; an id the lookup does not know stays in the answer with no name. */
    private Map<UUID, StatsPlayerDto> players(Collection<UUID> ids) {
        Map<UUID, StatsPlayerDto> result = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        Map<UUID, UserSummaryResponse> summaries = userService.getUserSummariesByIds(new ArrayList<>(new LinkedHashSet<>(ids)));
        for (UUID id : ids) {
            UserSummaryResponse summary = summaries.get(id);
            result.put(id, summary == null ? new StatsPlayerDto(id, null, null)
                    : new StatsPlayerDto(id, summary.getFullName(), summary.getAvatarUrl()));
        }
        return result;
    }

    private static StatsPlayerDto player(Map<UUID, StatsPlayerDto> names, UUID id) {
        return names.getOrDefault(id, new StatsPlayerDto(id, null, null));
    }

    /** One side of a record as stored: the players and the score of each slot. */
    private record RawTeam(List<UUID> players, List<Integer> scores) {
    }

    /** The teams of a record's data ({@code teams[].players} and {@code teams[].scores}); anything malformed is skipped. */
    private static List<RawTeam> rawTeams(Map<String, Object> data) {
        List<RawTeam> teams = new ArrayList<>();
        if (data != null && data.get("teams") instanceof List<?> list) {
            for (Object entry : list) {
                if (!(entry instanceof Map<?, ?> team)) {
                    continue;
                }
                List<UUID> players = new ArrayList<>();
                if (team.get("players") instanceof List<?> ids) {
                    for (Object id : ids) {
                        try {
                            players.add(UUID.fromString(String.valueOf(id)));
                        } catch (IllegalArgumentException e) {
                            // a malformed id is skipped: the display of an old record never fails
                        }
                    }
                }
                List<Integer> scores = new ArrayList<>();
                if (team.get("scores") instanceof List<?> values) {
                    for (Object value : values) {
                        scores.add(value instanceof Number number ? number.intValue() : null);
                    }
                }
                teams.add(new RawTeam(players, scores));
            }
        }
        return teams;
    }

    /** {@code WIN} or {@code LOSS} (or {@code DRAW}) for the player, {@code null} when the schema no longer reads the record. */
    private static String outcomeOf(Optional<RecordTypeReader> reader, Map<String, Object> schema, SessionRecord record,
                                    UUID userId) {
        if (reader.isEmpty()) {
            return null;
        }
        RecordFacts facts = reader.get().read(schema, record.getData());
        return facts.participants().stream()
                .filter(p -> p.userId().equals(userId))
                .map(p -> p.outcome() == RecordFacts.Outcome.NONE ? null : p.outcome().name())
                .findFirst().orElse(null);
    }

    /** A technical 400 (no error code, SESSION-45): the client never produces it, so the English message is the answer. */
    private static BadRequestException invalid(String message) {
        log.warn("Rejected statistics request parameters: {}", message);
        return new BadRequestException(message);
    }
}
