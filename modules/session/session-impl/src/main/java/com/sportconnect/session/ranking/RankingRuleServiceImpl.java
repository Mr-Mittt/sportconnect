package com.sportconnect.session.ranking;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.RankingRuleRequest;
import com.sportconnect.session.api.dto.RankingRuleResponse;
import com.sportconnect.session.api.service.RankingRuleService;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.stats.SportRankingRule;
import com.sportconnect.session.stats.SportRankingRuleRepository;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsCatalog;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-54: the admin side of the ranking rules. Every rule is checked against the sport's own schema before it is stored: the
 * sort list names catalog stats the sport really collects ({@code SESSION_RANKING_SORT_INVALID} with a reason), a
 * {@code PARTNER} rule needs a sport grouped by partner, a minimum above 0 needs {@code games} collected. Nothing here names a
 * class or a method: a rule is a list of keys. A change bumps the row's version and marks the boards it covers for a full rebuild
 * (the next ranking run rebuilds them whole from the players' blobs); it never touches a board directly.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RankingRuleServiceImpl implements RankingRuleService {

    private final SportRankingRuleRepository rules;
    private final StatBoardRunRepository runs;
    private final SportService sportService;
    private final LeaderboardRankingWorker worker;
    private final GroupService groupService;
    // SESSION-83: a group's own rule cannot name a stat the group switched off for its member row.
    private final GroupSessionSettingsRepository groupSettings;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    @Override
    @Transactional
    public RankingRuleResponse save(UUID adminId, Long sportId, RankingRuleRequest request) {
        String scopeType = scopeTypeOf(request.getScopeType());
        return store(adminId, sportId, scopeType, scopeIdOf(scopeType, request.getScopeId()), request);
    }

    /**
     * SESSION-54 slice B: a group's own sort list, set by the group's owner or admin. The sport is the group's, the scope is forced
     * to this group (whatever the request says), and the same validation as an admin rule applies. The group's board rebuilds at the
     * next run.
     */
    @Override
    @Transactional
    public RankingRuleResponse saveGroupRule(UUID callerId, Long groupId, RankingRuleRequest request) {
        Long sportId = requireGroupManager(callerId, groupId);
        RankingRuleResponse saved = store(callerId, sportId, SportRankingRule.GROUP, groupId, request);
        nudgeAfterCommit();
        return saved;
    }

    @Override
    @Transactional(readOnly = true)
    public List<RankingRuleResponse> listGroupRules(UUID callerId, Long groupId) {
        if (!groupService.isGroupMember(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's ranking", null);
        }
        Long sportId = groupSportOf(groupId, callerId);
        return rules.findAllOfSport(sportId).stream()
                .filter(row -> SportRankingRule.GROUP.equals(row.getScopeType()) && groupId.equals(row.getScopeId()))
                .map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public void deleteGroupRule(UUID callerId, Long groupId, String kind) {
        Long sportId = requireGroupManager(callerId, groupId);
        SportRankingRule.Key key = new SportRankingRule.Key(sportId, SportRankingRule.GROUP, groupId,
                kind == null ? "" : kind.trim().toUpperCase(Locale.ROOT));
        if (!rules.existsById(key)) {
            throw new NotFoundException("SESSION_RANKING_RULE_NOT_FOUND", "There is no such ranking rule", Map.of());
        }
        rules.deleteById(key);
        markRebuild(sportId, SportRankingRule.GROUP, groupId);
        nudgeAfterCommit();
    }

    /** The group's sport after the owner/admin gate (403 for a plain member or a non-member, as in the group settings). */
    private Long requireGroupManager(UUID callerId, Long groupId) {
        if (!groupService.isGroupMember(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's ranking", null);
        }
        if (!groupService.canManageMembers(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_ADMIN_REQUIRED", "Only a group owner or admin can set the ranking order", null);
        }
        return groupSportOf(groupId, callerId);
    }

    private Long groupSportOf(Long groupId, UUID callerId) {
        Long sportId = groupService.getGroup(groupId, callerId).getSportId();
        if (sportId == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "This group has no sport, so it has no leaderboard", null);
        }
        return sportId;
    }

    private RankingRuleResponse store(UUID adminId, Long sportId, String scopeType, Long scopeId, RankingRuleRequest request) {
        StatisticsSchema schema = schemaOf(sportId);
        String kind = kindOf(request.getKind(), schema);
        SortList sort = SortList.parse(request.getSort(), schema.catalog());
        // SESSION-84: a group's own rule is checked against the stats the group's own list holds (its view), the others against the sport's
        StatisticsSchema view = SportRankingRule.GROUP.equals(scopeType)
                ? schema.forGroup(groupSettings.findById(scopeId).map(row -> row.getStatsConfig()).orElse(null)) : schema;
        requireCollected(sort.operands(), view, kind, "SESSION_RANKING_SORT_INVALID");
        RequireList require = RequireList.parse(request.getRequire(), schema.catalog());
        requireCollected(require.operands(), view, kind, "SESSION_RANKING_REQUIRE_INVALID");

        SportRankingRule.Key key = new SportRankingRule.Key(sportId, scopeType, scopeId, kind);
        SportRankingRule row = rules.findById(key).orElse(null);
        if (row == null) {
            row = new SportRankingRule(sportId, scopeType, scopeId, kind);
            row.setVersion(1);
        } else {
            row.setVersion(row.getVersion() + 1);
        }
        row.setSort(new ArrayList<>(sort.toJson()));
        row.setConditions(new ArrayList<>(require.toJson()));
        row.setUpdatedBy(adminId);
        row.setUpdatedAt(clock.instant());
        rules.save(row);
        markRebuild(sportId, scopeType, scopeId);
        log.info("Ranking rule saved: sport {} {} {} {} version {}", sportId, scopeType, scopeId, kind, row.getVersion());
        return toResponse(row);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RankingRuleResponse> list(Long sportId) {
        schemaOf(sportId);
        return rules.findAllOfSport(sportId).stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public void delete(Long sportId, String scopeType, Long scopeId, String kind) {
        String type = scopeTypeOf(scopeType);
        Long id = scopeIdOf(type, scopeId);
        SportRankingRule.Key key = new SportRankingRule.Key(sportId, type, id, kind == null ? "" : kind.toUpperCase(Locale.ROOT));
        if (!rules.existsById(key)) {
            throw new NotFoundException("SESSION_RANKING_RULE_NOT_FOUND", "There is no such ranking rule", Map.of());
        }
        rules.deleteById(key);
        markRebuild(sportId, type, id);
    }

    @Override
    @Transactional
    public void rebuild(Long sportId) {
        schemaOf(sportId);
        runs.markFullRebuildOfSport(sportId, clock.instant());
        nudgeAfterCommit();
    }

    @Override
    public void runNow() {
        worker.nudge(LeaderboardRanker.Mode.NIGHTLY);
    }

    /**
     * Asks the worker to run once the marks of this transaction are committed: a worker that ran before the commit would not see
     * the boards as dirty and would find nothing to do. Outside a transaction it nudges at once.
     */
    private void nudgeAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    worker.nudge(LeaderboardRanker.Mode.NIGHTLY);
                }
            });
        } else {
            worker.nudge(LeaderboardRanker.Mode.NIGHTLY);
        }
    }

    private void markRebuild(Long sportId, String scopeType, Long scopeId) {
        Instant now = clock.instant();
        if (SportRankingRule.COUNTRY.equals(scopeType)) {
            runs.markFullRebuildOfCountry(sportId, scopeId, now);
        } else if (SportRankingRule.GROUP.equals(scopeType)) {
            runs.markFullRebuildOfGroup(sportId, scopeId, now);
        } else {
            runs.markFullRebuildOfSport(sportId, now);
        }
    }

    /** The sport's statistics schema (404 for a missing sport); a sport whose schema collects nothing has no ranking. */
    private StatisticsSchema schemaOf(Long sportId) {
        StatisticsSchema schema = StatisticsSchema.of(sportService.getResultSchema(sportId));
        if (!schema.collects()) {
            throw new ConflictException("SESSION_RANKING_STATISTICS_NOT_CONFIGURED",
                    "The sport's result schema collects no statistics, so it has nothing to rank", Map.of());
        }
        return schema;
    }

    private String scopeTypeOf(String scopeType) {
        String type = scopeType == null ? SportRankingRule.SPORT : scopeType.trim().toUpperCase(Locale.ROOT);
        if (!type.equals(SportRankingRule.SPORT) && !type.equals(SportRankingRule.COUNTRY)) {
            throw new BadRequestException("SESSION_RANKING_SCOPE_INVALID", "A ranking rule is for a SPORT or a COUNTRY",
                    Map.of("scopeType", String.valueOf(scopeType)));
        }
        return type;
    }

    private Long scopeIdOf(String scopeType, Long scopeId) {
        if (SportRankingRule.SPORT.equals(scopeType)) {
            return 0L;
        }
        if (scopeId == null || scopeId <= 0) {
            throw new BadRequestException("SESSION_RANKING_SCOPE_INVALID", "A COUNTRY rule needs the country id",
                    Map.of("scopeType", scopeType));
        }
        return scopeId;
    }

    private String kindOf(String kind, StatisticsSchema schema) {
        String value = kind == null ? "" : kind.trim().toUpperCase(Locale.ROOT);
        if (value.equals("TEAM")) {
            throw invalidKind("TEAM_NOT_AVAILABLE");
        }
        if (!value.equals(RankingRules.SINGLE) && !value.equals(RankingRules.PARTNER)) {
            throw invalidKind("UNKNOWN");
        }
        if (value.equals(RankingRules.PARTNER) && !schema.groupsByPartner()) {
            throw invalidKind("SPORT_NOT_GROUPED_BY_PARTNER");
        }
        return value;
    }

    private BadRequestException invalidKind(String reason) {
        return new BadRequestException("SESSION_RANKING_KIND_INVALID", "This kind of board is not available: " + reason,
                Map.of("reason", reason));
    }

    /** Every stat the keys or conditions read must be one the sport collects, and one that applies to the kind of board (SESSION-82), so the numbers a board is built from really exist. */
    private void requireCollected(Set<String> operands, StatisticsSchema schema, String kind, String errorCode) {
        Set<String> collected = schema.collected().stream().map(StatsCatalog.Stat::key).collect(Collectors.toSet());
        for (StatsCatalog.Stat needed : StatsCatalog.storedFor(schema.catalog(), operands)) {
            if (needed.singleOnly() && !RankingRules.SINGLE.equals(kind)) {
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("reason", "STAT_NOT_FOR_KIND");
                params.put("detail", needed.key());
                throw new BadRequestException(errorCode, needed.key() + " applies to a single player only, so a " + kind
                        + " board cannot use it", params);
            }
            if (!collected.contains(needed.key())) {
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("reason", "STAT_NOT_COLLECTED");
                params.put("detail", needed.key());
                throw new BadRequestException(errorCode,
                        "The sport does not collect " + needed.key() + ", so a board cannot use it", params);
            }
        }
    }

    private RankingRuleResponse toResponse(SportRankingRule row) {
        return RankingRuleResponse.builder().sportId(row.getSportId()).scopeType(row.getScopeType()).scopeId(row.getScopeId())
                .kind(row.getKind()).sort(row.getSort()).require(row.getConditions()).version(row.getVersion())
                .updatedAt(row.getUpdatedAt()).build();
    }
}
