package com.sportconnect.session.ranking;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.common.exception.TooManyRequestsException;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.LeaderboardEntryDto;
import com.sportconnect.session.api.dto.LeaderboardRefreshResponse;
import com.sportconnect.session.api.dto.LeaderboardResponse;
import com.sportconnect.session.api.dto.StatsPlayerDto;
import com.sportconnect.session.api.service.LeaderboardService;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-54 slice B: reads the boards the ranking job publishes, and refreshes a group's board by hand.
 *
 * <p><b>Reading.</b> A board comes from {@link LeaderboardTreeCache} (parsed once, valid while its {@code computed_at} is the stored
 * one). A page is a slice of the entries in rank order that skips whoever may not be shown: a deactivated player on any board, and on
 * a group board anyone who is no longer a member; a pair is shown only when both players may be. A page is found by a <b>cursor</b>
 * (a position in the board, not a page number), because the number of entries dropped by a page is not known in advance; one
 * request scans at most {@link #MAX_SCAN} entries, so a board full of deactivated players cannot make it unbounded. The caller's own
 * place is their best entry anywhere on the board, whatever the page. The rank shown is the board's rank (equal entries share it,
 * and a dropped entry leaves a gap): it is never recomputed at read time.
 *
 * <p><b>Refreshing.</b> One compare-and-set takes the board only when it was built at least the cooldown ago and nobody is building
 * it ({@code claimForRefresh}), so two refreshes at once, or a refresh and the nightly run, never build it twice. The build runs on the
 * request thread (a group board is built from its members' rows) and keeps the previous ranks of the last nightly build.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaderboardServiceImpl implements LeaderboardService {

    static final int MAX_PAGE = 50;
    /** The most entries one page request looks at. */
    static final int MAX_SCAN = 2_000;
    private static final int CHUNK = 200;

    private final LeaderboardTreeCache cache;
    private final SportService sportService;
    private final GroupService groupService;
    private final GroupMemberNumberService memberNumberService;
    private final UserService userService;
    private final GroupSessionSettingsRepository groupSettings;
    private final StatBoardRunRepository runs;
    private final LeaderboardWriter writer;
    private final LeaderboardRanker ranker;

    @Value("${app.stats.ranking.refresh-cooldown-minutes:60}")
    private long cooldownMinutes = 60;

    @Value("${app.stats.ranking.stale-minutes:15}")
    private long staleMinutes = 15;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** How the subjects of one kind of board are turned into players. */
    private interface Subjects {
        /** The user behind each subject token; a token nobody can be found for is absent. */
        Map<String, UUID> usersOf(Collection<String> tokens);

        /** Of these users, those that may be shown. */
        Set<UUID> listable(Collection<UUID> ids);

        /** The caller's token on this board, or {@code null}. */
        String tokenOf(UUID caller);
    }

    @Override
    public LeaderboardResponse getGroupBoard(Long groupId, UUID callerId, String kind, Integer cursor, int size) {
        requireGroupMember(groupId, callerId);
        Long sportId = groupSportId(groupId, callerId);
        requireSportOn(sportId);
        Set<UUID> members = new LinkedHashSet<>(groupService.getMemberUserIds(groupId));
        Subjects subjects = new Subjects() {
            @Override
            public Map<String, UUID> usersOf(Collection<String> tokens) {
                Set<Integer> numbers = new LinkedHashSet<>();
                for (String token : tokens) {
                    try {
                        numbers.add(Integer.parseInt(token));
                    } catch (NumberFormatException e) {
                        // not a member number: it names nobody
                    }
                }
                Map<String, UUID> result = new LinkedHashMap<>();
                if (!numbers.isEmpty()) {
                    memberNumberService.getUserIdsByMemberNumbers(groupId, numbers)
                            .forEach((number, user) -> result.put(String.valueOf(number), user));
                }
                return result;
            }

            @Override
            public Set<UUID> listable(Collection<UUID> ids) {
                List<UUID> current = ids.stream().filter(members::contains).distinct().toList();
                return current.isEmpty() ? Set.of() : userService.getActiveUserIds(current);
            }

            @Override
            public String tokenOf(UUID caller) {
                Integer number = memberNumberService.getMemberNumbers(groupId, List.of(caller)).get(caller);
                return number == null ? null : String.valueOf(number);
            }
        };
        return page(sportId, "GROUP", groupId, kindOf(kind), cursor, size, callerId, subjects);
    }

    @Override
    public LeaderboardResponse getRegionBoard(Long regionId, Long sportId, UUID callerId, String kind, Integer cursor, int size) {
        requireSportOn(sportId);
        return page(sportId, "REGION", regionId, kindOf(kind), cursor, size, callerId, userIdSubjects());
    }

    @Override
    public LeaderboardResponse getCountryBoard(Long countryId, Long sportId, UUID callerId, String kind, Integer cursor, int size) {
        requireSportOn(sportId);
        return page(sportId, "COUNTRY", countryId, kindOf(kind), cursor, size, callerId, userIdSubjects());
    }

    private Subjects userIdSubjects() {
        return new Subjects() {
            @Override
            public Map<String, UUID> usersOf(Collection<String> tokens) {
                Map<String, UUID> result = new LinkedHashMap<>();
                for (String token : tokens) {
                    try {
                        result.put(token, UUID.fromString(token));
                    } catch (IllegalArgumentException e) {
                        // not a user id: it names nobody
                    }
                }
                return result;
            }

            @Override
            public Set<UUID> listable(Collection<UUID> ids) {
                List<UUID> distinct = ids.stream().distinct().toList();
                return distinct.isEmpty() ? Set.of() : userService.getActiveUserIds(distinct);
            }

            @Override
            public String tokenOf(UUID caller) {
                return caller.toString();
            }
        };
    }

    private LeaderboardResponse page(Long sportId, String scopeType, Long scopeId, String kind, Integer cursor, int size,
                                     UUID callerId, Subjects subjects) {
        if (size < 1 || size > MAX_PAGE) {
            throw invalid("size must be between 1 and " + MAX_PAGE);
        }
        if (cursor != null && cursor < 0) {
            throw invalid("cursor must not be negative");
        }
        LeaderboardTreeCache.Loaded board = cache.get(sportId, scopeType, scopeId, kind);
        if (board == null) {
            return new LeaderboardResponse(sportId, scopeType, scopeId, kind, List.of(), 0, List.of(), null, null, null);
        }
        List<BoardTree.Entry> entries = board.entries();
        int total = board.total();
        int pos = cursor == null ? 0 : Math.min(cursor, total);
        int scanLimit = Math.min(total, pos + MAX_SCAN);

        List<BoardTree.Entry> shown = new ArrayList<>();
        while (shown.size() < size && pos < scanLimit) {
            int end = Math.min(pos + CHUNK, scanLimit);
            List<BoardTree.Entry> chunk = entries.subList(pos, end);
            Set<String> tokens = new LinkedHashSet<>();
            chunk.forEach(entry -> tokens.addAll(List.of(entry.subject().split(","))));
            Map<String, UUID> userOf = subjects.usersOf(tokens);
            Set<UUID> ok = subjects.listable(userOf.values());
            for (int i = 0; i < chunk.size(); i++) {
                if (isListable(chunk.get(i), userOf, ok)) {
                    shown.add(chunk.get(i));
                    if (shown.size() == size) {
                        pos = pos + i + 1;
                        break;
                    }
                }
                if (i == chunk.size() - 1) {
                    pos = end;
                }
            }
        }
        Integer nextCursor = pos < total ? pos : null;

        // the caller's own place, and every name this answer shows, with one lookup each
        BoardTree.Entry mine = null;
        String token = subjects.tokenOf(callerId);
        if (token != null && board.best().get(token) != null) {
            mine = entries.get(board.best().get(token));
        }
        List<BoardTree.Entry> all = new ArrayList<>(shown);
        if (mine != null) {
            all.add(mine);
        }
        Set<String> tokens = new LinkedHashSet<>();
        all.forEach(entry -> tokens.addAll(List.of(entry.subject().split(","))));
        Map<String, UUID> userOf = subjects.usersOf(tokens);
        Map<UUID, StatsPlayerDto> names = players(userOf.values());

        List<LeaderboardEntryDto> page = shown.stream().map(entry -> toDto(entry, userOf, names, board.tree())).toList();
        LeaderboardEntryDto me = mine == null ? null : toDto(mine, userOf, names, board.tree());
        return new LeaderboardResponse(sportId, scopeType, scopeId, kind, new ArrayList<Object>(board.tree().sort().toJson()),
                total, page, me, nextCursor, board.computedAt());
    }

    private static boolean isListable(BoardTree.Entry entry, Map<String, UUID> userOf, Set<UUID> ok) {
        for (String token : entry.subject().split(",")) {
            UUID user = userOf.get(token);
            if (user == null || !ok.contains(user)) {
                return false;
            }
        }
        return true;
    }

    private static LeaderboardEntryDto toDto(BoardTree.Entry entry, Map<String, UUID> userOf, Map<UUID, StatsPlayerDto> names,
                                             BoardTree tree) {
        List<StatsPlayerDto> players = new ArrayList<>();
        for (String token : entry.subject().split(",")) {
            UUID user = userOf.get(token);
            if (user != null) {
                players.add(names.getOrDefault(user, new StatsPlayerDto(user, null, null)));
            }
        }
        List<Double> values = new ArrayList<>();
        for (int i = 0; i < tree.sort().size(); i++) {
            double value = entry.values().get(i);
            values.add(Double.isNaN(value) ? null : value);
        }
        return new LeaderboardEntryDto(entry.rank(), entry.prevRank(), players, values);
    }

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

    @Override
    public LeaderboardRefreshResponse refreshGroupBoard(Long groupId, UUID callerId) {
        requireGroupMember(groupId, callerId);
        if (!groupService.canManageMembers(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_ADMIN_REQUIRED", "Only a group owner or admin can refresh the leaderboard", null);
        }
        Long sportId = groupSportId(groupId, callerId);
        requireSportOn(sportId);
        if (!groupSettings.existsByGroupIdAndStatisticsEnabledTrue(groupId)) {
            throw new ConflictException("SESSION_GROUP_STATISTICS_OFF", "This group's statistics are switched off", Map.of());
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        Duration cooldown = Duration.ofMinutes(cooldownMinutes);
        try {
            writer.ensureBoardRun(sportId, "GROUP", groupId, null);
        } catch (DataIntegrityViolationException e) {
            log.info("Group board run row race absorbed: group {}", groupId);
        }
        if (!writer.claimForRefresh(sportId, groupId, now, now.minus(cooldown), now.minus(Duration.ofMinutes(staleMinutes)))) {
            StatBoardRun row = runs.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElse(null);
            if (row != null && StatBoardRun.RUNNING.equals(row.getStatus()) && row.getClaimedAt() != null
                    && row.getClaimedAt().isAfter(now.minus(Duration.ofMinutes(staleMinutes)))) {
                throw new ConflictException("SESSION_RANKING_IN_PROGRESS", "This leaderboard is being built right now", Map.of());
            }
            long retry = row == null || row.getComputedAt() == null ? 1
                    : Math.max(1, Duration.between(now, row.getComputedAt().plus(cooldown)).toSeconds());
            throw new TooManyRequestsException("SESSION_RANKING_COOLDOWN",
                    "The leaderboard was built recently; try again in " + retry + " seconds", Map.of("retryAfterSeconds", retry));
        }
        StatBoardRun board = runs.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow();
        ranker.refreshClaimed(board, now);
        return new LeaderboardRefreshResponse(now, now.plus(cooldown));
    }

    /** The group's own sport (a group has at most one); none is 400 SESSION_SPORT_REQUIRED, as for its statistics. */
    private Long groupSportId(Long groupId, UUID callerId) {
        Long sportId = groupService.getGroup(groupId, callerId).getSportId();
        if (sportId == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "This group has no sport, so it has no leaderboard", null);
        }
        return sportId;
    }

    /** One 403 for a non-member and for a missing or inactive group alike. */
    private void requireGroupMember(Long groupId, UUID userId) {
        if (!groupService.isGroupMember(groupId, userId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's leaderboard", null);
        }
    }

    /** A sport whose statistics switch is off answers as an unknown sport (the check itself answers a missing one). */
    private void requireSportOn(Long sportId) {
        boolean on;
        try {
            on = sportService.isStatisticsEnabled(sportId);
        } catch (ResourceNotFoundException e) {
            on = false;
        }
        if (!on) {
            throw new NotFoundException("SPORT_NOT_FOUND", "Sport not found", Map.of());
        }
    }

    private static String kindOf(String kind) {
        String value = kind == null || kind.isBlank() ? RankingRules.SINGLE : kind.trim().toUpperCase(Locale.ROOT);
        if (!value.equals(RankingRules.SINGLE) && !value.equals(RankingRules.PARTNER)) {
            throw new BadRequestException("SESSION_RANKING_KIND_INVALID", "This kind of board is not available: UNKNOWN",
                    Map.of("reason", "UNKNOWN"));
        }
        return value;
    }

    /** A technical 400 (no error code): the client never produces it, so the English message is the answer. */
    private static BadRequestException invalid(String message) {
        log.warn("Rejected leaderboard request parameters: {}", message);
        return new BadRequestException(message);
    }
}
