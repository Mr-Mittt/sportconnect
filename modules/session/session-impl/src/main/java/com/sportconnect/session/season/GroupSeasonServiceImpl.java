package com.sportconnect.session.season;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.CreateSeasonRequest;
import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonDefaultsResponse;
import com.sportconnect.session.api.dto.SeasonLinkedSessionResponse;
import com.sportconnect.session.api.dto.SeasonLinksRequest;
import com.sportconnect.session.api.dto.SeasonResponse;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.UpdateSeasonRequest;
import com.sportconnect.session.api.service.GroupSeasonService;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.PostLikeInfoResponse;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * SESSION-55 slice 1 - see {@link GroupSeasonService}. Reads are for members of an active group, every write for its owner and admins.
 * A change and the group post that announces it are one transaction. Creating and editing take the group's mutex
 * ({@link SeasonGroupLock}) so two overlapping requests cannot both pass the limit and overlap checks; an edit, a cancel and a link change
 * also take the season's own row lock, the same one the status job takes, so a transition and an edit never interleave.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupSeasonServiceImpl implements GroupSeasonService {

    /** At most this many seasons per group in {@code SCHEDULED} or {@code ONGOING} (owner, 2026-11-27). */
    static final int MAX_OPEN = 2;
    /** At most this many ids in each of the add and remove lists of one links call. */
    static final int MAX_LINKS_PER_CALL = 20;

    private static final Set<SeasonStatus> LINKS_EDITABLE = EnumSet.of(SeasonStatus.ONGOING, SeasonStatus.COMPLETED);

    private final GroupSeasonRepository seasonRepository;
    private final GroupSeasonSessionRepository linkRepository;
    private final SessionRepository sessionRepository;
    private final GroupSessionSettingsRepository settingsRepository;
    private final GroupService groupService;
    private final SportService sportService;
    private final PostService postService;
    private final CommentService commentService;
    private final UserService userService;
    private final SeasonRules seasonRules;
    private final SeasonGroupLock groupLock;
    private final SeasonGate seasonGate;
    private final SeasonAnnouncer announcer;

    /** Replaceable in tests, like the other services of this module. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    // ---- defaults, create, edit, cancel ----------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public SeasonDefaultsResponse getDefaults(Long groupId, UUID callerId) {
        requireManager(groupId, callerId);
        GroupResponse group = groupService.getGroup(groupId, callerId);
        ZoneId zone = zoneOf(group);
        StatisticsSchema sport = sportSchema(group.getSportId());
        Map<String, Object> statsConfig = seasonRules.defaultStatsConfig(sport, groupStatsConfig(groupId));
        Map<String, Object> rule = seasonRules.defaultRankingRule(group.getSportId(), groupId, sport, sport.forGroup(statsConfig));
        return SeasonDefaultsResponse.builder()
                .statsConfig(statsConfig)
                .rankingRule(rule)
                .timezone(zone.getId())
                .today(today(zone))
                .maxDays(SeasonDates.MAX_DAYS)
                .build();
    }

    @Override
    @Transactional
    public SeasonResponse create(Long groupId, UUID callerId, CreateSeasonRequest request) {
        requireManager(groupId, callerId);
        GroupResponse group = groupService.getGroup(groupId, callerId);
        ZoneId zone = zoneOf(group);
        String name = requireName(request.getName());
        SeasonDates.validate(request.getStartDate(), request.getEndDate(), today(zone));
        Long sportId = requireStatisticsSport(group);
        StatisticsSchema sport = sportSchema(sportId);

        Map<String, Object> statsConfig = request.getStatsConfig() != null
                ? seasonRules.statsConfigOf(request.getStatsConfig(), sport)
                : seasonRules.defaultStatsConfig(sport, groupStatsConfig(groupId));
        StatisticsSchema view = sport.forGroup(statsConfig);
        Map<String, Object> rule = request.getRankingRule() != null
                ? seasonRules.rankingRuleOf(request.getRankingRule(), sport, view)
                : seasonRules.defaultRankingRule(sportId, groupId, sport, view);

        // From here the group's seasons are read under the group's mutex, so two creates cannot both pass.
        groupLock.lock(groupId);
        requireRoom(groupId, null, request.getStartDate(), request.getEndDate(), true);

        Instant now = clock.instant();
        Long postId = postService.createSeasonPost(callerId, "Season: " + name);
        GroupSeason season = seasonRepository.save(GroupSeason.builder()
                .groupId(groupId)
                .sportId(sportId)
                .name(name)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .timezone(zone.getId())
                .status(SeasonStatus.SCHEDULED)
                .collectionMode(request.getCollectionMode() != null ? request.getCollectionMode() : SeasonCollectionMode.AUTO)
                .inheritRanks(Boolean.TRUE.equals(request.getInheritRanks()))
                .statsConfig(statsConfig)
                .rankingRule(rule)
                .postId(postId)
                .createdBy(callerId)
                .createdAt(now)
                .updatedAt(now)
                .build());
        announcer.announce(season, SystemCode.GROUP_SEASON_CREATED, nameOf(callerId));
        log.info("Season {} created in group {} by {} ({} to {}, {})", season.getId(), groupId, callerId,
                season.getStartDate(), season.getEndDate(), season.getCollectionMode());
        return toResponse(season, 0, null, null);
    }

    @Override
    @Transactional
    public SeasonResponse update(Long groupId, Long seasonId, UUID callerId, UpdateSeasonRequest request) {
        requireManager(groupId, callerId);
        groupLock.lock(groupId);
        GroupSeason season = lockedSeason(groupId, seasonId);
        if (season.getStatus() != SeasonStatus.SCHEDULED) {
            throw new ConflictException("SESSION_SEASON_NOT_EDITABLE", "Only a scheduled season can be edited",
                    Map.of("status", season.getStatus().name()));
        }
        ZoneId zone = ZoneId.of(season.getTimezone());
        StatisticsSchema sport = sportSchema(season.getSportId());

        LocalDate start = request.getStartDate() != null ? request.getStartDate() : season.getStartDate();
        LocalDate end = request.getEndDate() != null ? request.getEndDate() : season.getEndDate();
        SeasonDates.validate(start, end, today(zone));
        requireRoom(groupId, season.getId(), start, end, false);

        Map<String, Object> statsConfig = request.getStatsConfig() != null
                ? seasonRules.statsConfigOf(request.getStatsConfig(), sport) : season.getStatsConfig();
        StatisticsSchema view = sport.forGroup(statsConfig);
        Map<String, Object> rule;
        if (request.getRankingRule() != null) {
            rule = seasonRules.rankingRuleOf(request.getRankingRule(), sport, view);
        } else if (request.getStatsConfig() != null) {
            // a new stat list: the rule the season keeps must still be one the list can value (the owner sends both when it cannot)
            rule = seasonRules.rankingRuleOf(season.getRankingRule(), sport, view);
        } else {
            rule = season.getRankingRule();
        }

        if (request.getName() != null) {
            season.setName(requireName(request.getName()));
        }
        season.setStartDate(start);
        season.setEndDate(end);
        if (request.getCollectionMode() != null) {
            season.setCollectionMode(request.getCollectionMode());
        }
        if (request.getInheritRanks() != null) {
            season.setInheritRanks(request.getInheritRanks());
        }
        season.setStatsConfig(statsConfig);
        season.setRankingRule(rule);
        season.setUpdatedAt(clock.instant());
        season = seasonRepository.save(season);
        if (season.getCollectionMode() == SeasonCollectionMode.AUTO) {
            // a season that is not MANUAL has no links: a switch to AUTO drops the ones it had (it has not started, so none was counted)
            linkRepository.deleteAll(linkRepository.findBySeasonId(season.getId()));
        }
        return toResponse(season, (int) linkRepository.countBySeasonId(season.getId()), null, null);
    }

    @Override
    @Transactional
    public SeasonResponse cancel(Long groupId, Long seasonId, UUID callerId) {
        requireManager(groupId, callerId);
        GroupSeason season = lockedSeason(groupId, seasonId);
        if (!season.getStatus().isOpen()) {
            throw new ConflictException("SESSION_SEASON_NOT_CANCELLABLE", "Only a scheduled or ongoing season can be cancelled",
                    Map.of("status", season.getStatus().name()));
        }
        Instant now = clock.instant();
        season.setStatus(SeasonStatus.CANCELLED);
        season.setCancelledBy(callerId);
        season.setCancelledAt(now);
        season.setUpdatedAt(now);
        season = seasonRepository.save(season);
        announcer.announce(season, SystemCode.GROUP_SEASON_CANCELLED, nameOf(callerId));
        log.info("Season {} of group {} cancelled by {}", seasonId, groupId, callerId);
        return toResponse(season, (int) linkRepository.countBySeasonId(season.getId()), null, null);
    }

    // ---- reads ------------------------------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public SeasonResponse get(Long groupId, Long seasonId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        PostLikeInfoResponse like = postService.getSessionPostLikeInfo(List.of(season.getPostId()), callerId).get(season.getPostId());
        return toResponse(season, (int) linkRepository.countBySeasonId(seasonId),
                like != null ? like.getLikeCount() : 0L, like != null ? like.getIsLikedByCurrentUser() : Boolean.FALSE);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SeasonResponse> list(Long groupId, UUID callerId, Set<SeasonStatus> statuses, Pageable pageable) {
        requireMember(groupId, callerId);
        Set<SeasonStatus> wanted = statuses == null || statuses.isEmpty() ? EnumSet.allOf(SeasonStatus.class) : statuses;
        Page<GroupSeason> page = seasonRepository.findByGroupIdAndStatusInOrderByStartDateDescIdDesc(groupId, wanted, pageable);
        // one query for the link counts of the whole page, never one per season
        Map<Long, Long> counts = page.isEmpty() ? Map.of() : linkRepository.countBySeasonIds(
                page.getContent().stream().map(GroupSeason::getId).toList()).stream()
                .collect(Collectors.toMap(GroupSeasonSessionRepository.LinkCount::getSeasonId, GroupSeasonSessionRepository.LinkCount::getCount));
        return page.map(season -> toResponse(season, counts.getOrDefault(season.getId(), 0L).intValue(), null, null));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SeasonLinkedSessionResponse> getLinks(Long groupId, Long seasonId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        return linksOf(season);
    }

    // ---- links ------------------------------------------------------------------------------------------------------

    @Override
    @Transactional
    public List<SeasonLinkedSessionResponse> updateLinks(Long groupId, Long seasonId, UUID callerId, SeasonLinksRequest request) {
        requireManager(groupId, callerId);
        GroupSeason season = lockedSeason(groupId, seasonId);
        if (season.getCollectionMode() != SeasonCollectionMode.MANUAL || !LINKS_EDITABLE.contains(season.getStatus())) {
            throw new ConflictException("SESSION_SEASON_LINKS_NOT_ALLOWED",
                    "Sessions can be linked only to a manual season that is ongoing or completed",
                    Map.of("status", season.getStatus().name(), "collectionMode", season.getCollectionMode().name()));
        }
        Set<Long> add = idsOf(request.getAdd());
        Set<Long> remove = idsOf(request.getRemove());
        if (!add.isEmpty()) {
            addLinks(season, add, callerId);
        }
        if (!remove.isEmpty()) {
            linkRepository.deleteBySeasonIdAndSessionIdIn(season.getId(), remove);
        }
        return linksOf(season);
    }

    private void addLinks(GroupSeason season, Set<Long> sessionIds, UUID callerId) {
        Map<Long, Session> found = sessionRepository.findAllById(sessionIds).stream()
                .collect(Collectors.toMap(Session::getId, Function.identity()));
        ZoneId zone = ZoneId.of(season.getTimezone());
        Set<Long> already = linkRepository.findBySeasonId(season.getId()).stream()
                .map(GroupSeasonSession::getSessionId).collect(Collectors.toSet());
        Instant now = clock.instant();
        for (Long sessionId : sessionIds) {
            Session session = found.get(sessionId);
            if (session == null || !season.getGroupId().equals(session.getGroupId())) {
                throw invalidSession(sessionId, session == null ? "NOT_FOUND" : "NOT_IN_GROUP");
            }
            LocalDate date = SeasonDates.localDate(session.getScheduledStart(), zone);
            if (!SeasonDates.contains(season.getStartDate(), season.getEndDate(), date)) {
                throw invalidSession(sessionId, "OUT_OF_RANGE");
            }
        }
        for (Long sessionId : sessionIds) {
            if (!already.contains(sessionId)) {
                linkRepository.save(new GroupSeasonSession(season.getId(), sessionId, callerId, now));
            }
        }
    }

    private static BadRequestException invalidSession(Long sessionId, String reason) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("reason", reason);
        params.put("sessionId", sessionId);
        return new BadRequestException("SESSION_SEASON_SESSION_INVALID",
                "Session " + sessionId + " cannot be linked to this season: " + reason, params);
    }

    private static Set<Long> idsOf(List<Long> ids) {
        if (ids == null) {
            return Set.of();
        }
        Set<Long> unique = new LinkedHashSet<>(ids);
        if (unique.size() > MAX_LINKS_PER_CALL) {
            throw new BadRequestException("SESSION_SEASON_SESSION_INVALID", "At most " + MAX_LINKS_PER_CALL + " sessions per call",
                    Map.of("reason", "TOO_MANY", "max", MAX_LINKS_PER_CALL));
        }
        return unique;
    }

    private List<SeasonLinkedSessionResponse> linksOf(GroupSeason season) {
        List<Long> ids = linkRepository.findBySeasonId(season.getId()).stream().map(GroupSeasonSession::getSessionId).toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        ZoneId zone = ZoneId.of(season.getTimezone());
        return sessionRepository.findAllById(ids).stream()
                .sorted(Comparator.comparing(Session::getScheduledStart).thenComparing(Session::getId))
                .map(session -> SeasonLinkedSessionResponse.builder()
                        .sessionId(session.getId())
                        .title(session.getTitle())
                        .scheduledStart(session.getScheduledStart())
                        .status(session.getStatus())
                        .localDate(SeasonDates.localDate(session.getScheduledStart(), zone))
                        .build())
                .toList();
    }

    // ---- the season's thread ----------------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public Page<CommentResponse> getComments(Long groupId, Long seasonId, UUID callerId, Pageable pageable) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        return commentService.getSessionPostComments(season.getPostId(), callerId, pageable);
    }

    @Override
    @Transactional
    public CommentResponse createComment(Long groupId, Long seasonId, UUID callerId, CreateCommentRequest request) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        return commentService.createSessionComment(season.getPostId(), callerId, request);
    }

    @Override
    @Transactional
    public void likeComment(Long groupId, Long seasonId, Long commentId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        commentService.likeSessionComment(season.getPostId(), commentId, callerId);
    }

    @Override
    @Transactional
    public void unlikeComment(Long groupId, Long seasonId, Long commentId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        commentService.unlikeSessionComment(season.getPostId(), commentId, callerId);
    }

    @Override
    @Transactional
    public void like(Long groupId, Long seasonId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        postService.likeSessionPost(season.getPostId(), callerId);
    }

    @Override
    @Transactional
    public void unlike(Long groupId, Long seasonId, UUID callerId) {
        GroupSeason season = visibleSeason(groupId, seasonId, callerId);
        postService.unlikeSessionPost(season.getPostId(), callerId);
    }

    // ---- checks and helpers -----------------------------------------------------------------------------------------

    /** The season of this group, or 404 {@code SESSION_SEASON_NOT_FOUND}; then the gate (available, then visible: 404 then 403). */
    private GroupSeason visibleSeason(Long groupId, Long seasonId, UUID callerId) {
        GroupSeason season = seasonRepository.findByIdAndGroupId(seasonId, groupId).orElse(null);
        return seasonGate.require(season, callerId, "SESSION_SEASON_NOT_FOUND", "Season not found",
                "SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's seasons");
    }

    /** The season of this group with its row locked for the rest of the transaction (404 when it is not this group's). */
    private GroupSeason lockedSeason(Long groupId, Long seasonId) {
        GroupSeason season = seasonRepository.findByIdForUpdate(seasonId).orElse(null);
        if (season == null || !season.getGroupId().equals(groupId)) {
            throw new NotFoundException("SESSION_SEASON_NOT_FOUND", "Season not found", null);
        }
        return season;
    }

    /**
     * The group may hold two open seasons ({@code create} only: an edit does not add one) and no two seasons that are not cancelled may
     * share a day. Both are read under the group's lock.
     */
    private void requireRoom(Long groupId, Long selfId, LocalDate start, LocalDate end, boolean counts) {
        if (counts && seasonRepository.countByGroupIdAndStatusIn(groupId, EnumSet.of(SeasonStatus.SCHEDULED, SeasonStatus.ONGOING)) >= MAX_OPEN) {
            throw new ConflictException("SESSION_SEASON_LIMIT", "A group can have at most " + MAX_OPEN + " scheduled or ongoing seasons",
                    Map.of("max", MAX_OPEN));
        }
        for (GroupSeason other : seasonRepository.findByGroupIdAndStatusNot(groupId, SeasonStatus.CANCELLED)) {
            if (!other.getId().equals(selfId)
                    && SeasonDates.overlaps(start, end, other.getStartDate(), other.getEndDate())) {
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("seasonId", other.getId());
                params.put("startDate", other.getStartDate().toString());
                params.put("endDate", other.getEndDate().toString());
                throw new ConflictException("SESSION_SEASON_OVERLAP", "These dates overlap another season of the group", params);
            }
        }
    }

    private void requireActiveGroup(Long groupId) {
        if (!groupService.isGroupActive(groupId)) {
            throw ResourceNotFoundException.coded("GROUP_NOT_FOUND", "Group not found", null);
        }
    }

    private void requireMember(Long groupId, UUID callerId) {
        requireActiveGroup(groupId);
        if (!groupService.isGroupMember(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's seasons", null);
        }
    }

    private void requireManager(Long groupId, UUID callerId) {
        requireActiveGroup(groupId);
        if (!groupService.canManageMembers(groupId, callerId)) {
            if (groupService.isGroupMember(groupId, callerId)) {
                throw new ForbiddenException("SESSION_GROUP_ADMIN_REQUIRED", "Only group owners and admins can change this group's seasons", null);
            }
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's seasons", null);
        }
    }

    private static String requireName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new BadRequestException("SESSION_SEASON_NAME_REQUIRED", "A season needs a name", null);
        }
        return trimmed;
    }

    /** The group's timezone (B25), or 409: a season's local dates cannot be read without one, and none is guessed. */
    private static ZoneId zoneOf(GroupResponse group) {
        String timezone = group.getTimezone();
        if (timezone == null || timezone.isBlank()) {
            throw new ConflictException("SESSION_SEASON_TIMEZONE_MISSING", "The group's region has no timezone yet", null);
        }
        try {
            return ZoneId.of(timezone);
        } catch (DateTimeException e) {
            throw new ConflictException("SESSION_SEASON_TIMEZONE_MISSING", "The group's timezone is not valid", Map.of("timezone", timezone));
        }
    }

    private LocalDate today(ZoneId zone) {
        return LocalDate.now(clock.withZone(zone));
    }

    /** The group's sport; a season needs statistics, so the sport must have them switched on (the same code the group setting uses). */
    private Long requireStatisticsSport(GroupResponse group) {
        if (group.getSportId() == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "This group has no sport", null);
        }
        if (!sportService.isStatisticsEnabled(group.getSportId())) {
            throw new ConflictException("SESSION_GROUP_STATISTICS_NOT_AVAILABLE",
                    "This group's sport does not have statistics switched on", null);
        }
        return group.getSportId();
    }

    private StatisticsSchema sportSchema(Long sportId) {
        try {
            return StatisticsSchema.of(sportService.getResultSchema(sportId));
        } catch (ResourceNotFoundException e) {
            return StatisticsSchema.of(Map.of());
        }
    }

    private Map<String, Object> groupStatsConfig(Long groupId) {
        return settingsRepository.findById(groupId).map(GroupSessionSettings::getStatsConfig).orElse(null);
    }

    private String nameOf(UUID userId) {
        return userService.getUserSummariesByIds(List.of(userId)).values().stream().findFirst()
                .map(UserSummaryResponse::getFullName).orElse("");
    }


    private SeasonResponse toResponse(GroupSeason season, int linkedCount, Long likeCount, Boolean liked) {
        return SeasonResponse.builder()
                .id(season.getId())
                .groupId(season.getGroupId())
                .sportId(season.getSportId())
                .name(season.getName())
                .startDate(season.getStartDate())
                .endDate(season.getEndDate())
                .timezone(season.getTimezone())
                .status(season.getStatus())
                .collectionMode(season.getCollectionMode())
                .inheritRanks(season.isInheritRanks())
                .statsConfig(season.getStatsConfig())
                .rankingRule(season.getRankingRule())
                .postId(season.getPostId())
                .createdBy(season.getCreatedBy())
                .createdAt(season.getCreatedAt())
                .cancelledAt(season.getCancelledAt())
                .finalisedAt(season.getFinalisedAt())
                .linkedSessionCount(linkedCount)
                .likeCount(likeCount != null ? likeCount : 0L)
                .isLikedByCurrentUser(liked != null ? liked : Boolean.FALSE)
                .build();
    }

}
