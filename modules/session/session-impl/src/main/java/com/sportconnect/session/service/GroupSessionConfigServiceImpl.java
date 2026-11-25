package com.sportconnect.session.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.GroupSessionAudienceMember;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceRequest;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceResponse;
import com.sportconnect.session.api.dto.GroupSessionSettingsResponse;
import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.api.dto.RegularSessionScope;
import com.sportconnect.session.api.dto.RegularSessionsCountResponse;
import com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest;
import com.sportconnect.session.api.service.GroupSessionConfigService;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-GROUP-4 — see {@link GroupSessionConfigService}. Read is for any member of an active group; every write is for its
 * owner and admins. A change and the group post that tells the members about it are one transaction, so neither is ever left
 * without the other.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupSessionConfigServiceImpl implements GroupSessionConfigService {

    /** At most this many recurrences per group, mode and day (drafts count): the owner's rule, 2026-11-19. */
    static final int MAX_PER_DAY = 5;

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final GroupSessionSettingsRepository settingsRepository;
    private final GroupSessionRecurrenceRepository recurrenceRepository;
    private final GroupService groupService;
    private final LocationService locationService;
    private final PostService postService;
    private final UserService userService;
    private final SessionAttributeResolver attributeResolver;
    // SESSION-GROUP-5: asks the generator to look at the group once this transaction commits.
    private final ApplicationEventPublisher eventPublisher;
    // SESSION-GROUP-6: cancels the scheduled regular sessions when the owner asks for it.
    private final RegularSessionCanceller regularSessionCanceller;
    private final SessionRepository sessionRepository;
    // SESSION-78: the group's statistics setting only exists while the group's sport has statistics switched on.
    private final SportService sportService;

    // ---- settings -------------------------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public GroupSessionSettingsResponse getSettings(Long groupId, UUID callerId) {
        requireMember(groupId, callerId);
        return toSettingsResponse(groupId, settingsRepository.findById(groupId).orElse(null), statisticsAvailable(groupId, callerId));
    }

    @Override
    @Transactional
    public GroupSessionSettingsResponse updateSettings(Long groupId, UUID callerId, UpdateGroupSessionSettingsRequest request) {
        requireManager(groupId, callerId);
        // SESSION-78: while the group's sport has statistics off the statistics setting is not shown and cannot be changed (any value, on or off).
        boolean statisticsAvailable = statisticsAvailable(groupId, callerId);
        if (request.getStatisticsEnabled() != null && !statisticsAvailable) {
            throw new ConflictException("SESSION_GROUP_STATISTICS_NOT_AVAILABLE",
                    "This group's sport does not have statistics switched on", null);
        }
        GroupSessionSettings existing = settingsRepository.findById(groupId).orElse(null);
        boolean currentEnabled = existing != null && existing.isEnabled();
        RecurrenceMode currentMode = existing != null ? existing.getMode() : RecurrenceMode.WEEKLY;

        boolean enabledChanged = request.getEnabled() != null && request.getEnabled() != currentEnabled;
        boolean modeChanged = request.getMode() != null && request.getMode() != currentMode;
        boolean currentStatistics = existing != null && existing.isStatisticsEnabled();
        boolean statisticsChanged = request.getStatisticsEnabled() != null && request.getStatisticsEnabled() != currentStatistics;
        if (!enabledChanged && !modeChanged && !statisticsChanged) {
            // Nothing to change: no row is created for a no-op, no post is written.
            return toSettingsResponse(groupId, existing, statisticsAvailable);
        }

        GroupSessionSettings settings = existing != null ? existing : GroupSessionSettings.builder().groupId(groupId).build();
        if (enabledChanged) {
            settings.setEnabled(request.getEnabled());
        }
        if (modeChanged) {
            settings.setMode(request.getMode());
        }
        if (statisticsChanged) {
            settings.setStatisticsEnabled(request.getStatisticsEnabled());
        }
        GroupSessionSettings saved = settingsRepository.save(settings);

        // SESSION-GROUP-6: the owner chose to cancel what the old rule left scheduled (only when generation is turned off or the
        // mode is switched; a call that does neither ignores the flag). Done before the posts, in this transaction.
        int cancelled = 0;
        boolean turnedOff = enabledChanged && !saved.isEnabled();
        if (Boolean.TRUE.equals(request.getCancelScheduled()) && (turnedOff || modeChanged)) {
            cancelled = regularSessionCanceller.cancel(
                    sessionRepository.findByGroupIdAndRecurrenceIdIsNotNullAndStatusIn(groupId, RegularSessionCanceller.SCHEDULED_STATUSES),
                    callerId, turnedOff
                            ? "Cancelled because the group turned off regular sessions"
                            : "Cancelled because the group switched its regular sessions to " + modeWord(saved.getMode()));
        }

        String name = actorName(callerId);
        if (enabledChanged) {
            boolean on = saved.isEnabled();
            announce(groupId, on ? SystemCode.GROUP_SESSION_GENERATION_ON : SystemCode.GROUP_SESSION_GENERATION_OFF,
                    name + (on ? " turned on" : " turned off") + " regular sessions (" + modeWord(saved.getMode()) + ")",
                    params(name, saved.getMode(), null, null));
        }
        if (modeChanged) {
            announce(groupId, SystemCode.GROUP_SESSION_MODE_CHANGED,
                    name + " switched regular sessions to " + modeWord(saved.getMode()),
                    params(name, saved.getMode(), null, null));
        }
        if (statisticsChanged) {
            // SESSION-78: told in the group like the other settings; no push notification. Statistics counted from now on only.
            boolean on = saved.isStatisticsEnabled();
            announce(groupId, on ? SystemCode.GROUP_STATISTICS_ON : SystemCode.GROUP_STATISTICS_OFF,
                    name + (on ? " turned on" : " turned off") + " statistics and the leaderboard", new HashMap<>(Map.of("name", name)));
        }
        log.info("Group {} session settings changed by {}: enabled={}, mode={}, statisticsEnabled={}", groupId, callerId,
                saved.isEnabled(), saved.getMode(), saved.isStatisticsEnabled());
        // SESSION-GROUP-5: switching generation ON, or switching the mode while it is on, makes slots due: queue and generate them.
        if (saved.isEnabled() && (enabledChanged || modeChanged)) {
            eventPublisher.publishEvent(new GroupSessionGenerationEvents.ConfigChanged(groupId));
        }
        GroupSessionSettingsResponse response = toSettingsResponse(groupId, saved, statisticsAvailable);
        response.setCancelledSessions(cancelled);
        return response;
    }

    // ---- recurrences ----------------------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<GroupSessionRecurrenceResponse> getRecurrences(Long groupId, UUID callerId) {
        requireMember(groupId, callerId);
        List<GroupSessionRecurrence> recurrences = recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(groupId);
        if (recurrences.isEmpty()) {
            return List.of();
        }
        // One batch lookup for the distinct locations of every configuration, never one per row.
        List<Long> locationIds = recurrences.stream().map(GroupSessionRecurrence::getLocationId).filter(Objects::nonNull).distinct().toList();
        Map<Long, LocationResponse> locations = locationIds.isEmpty() ? Map.of() : locationService.getLocationsByIds(locationIds);
        // ...and one for the chosen members of every SPECIFIC audience (CLIENT-GROUP-SESSION-5).
        Map<UUID, UserSummaryResponse> members = audienceSummaries(recurrences.stream()
                .map(GroupSessionRecurrence::getAudienceUserIds).filter(Objects::nonNull).flatMap(List::stream).distinct().toList());
        return recurrences.stream()
                .map(recurrence -> toResponse(recurrence, recurrence.getLocationId() == null ? null : locations.get(recurrence.getLocationId()), members))
                .toList();
    }

    @Override
    @Transactional
    public GroupSessionRecurrenceResponse createRecurrence(Long groupId, UUID callerId, GroupSessionRecurrenceRequest request) {
        requireManager(groupId, callerId);
        RecurrenceMode mode = settingsRepository.findById(groupId).map(GroupSessionSettings::getMode).orElse(RecurrenceMode.WEEKLY);
        GroupSessionRecurrence recurrence = GroupSessionRecurrence.builder().groupId(groupId).mode(mode).build();
        LocationResponse location = apply(recurrence, request, groupId, callerId);

        if (recurrenceRepository.countByGroupIdAndModeAndDayKey(groupId, mode, recurrence.getDayKey()) >= MAX_PER_DAY) {
            throw dayLimit();
        }
        GroupSessionRecurrence saved = recurrenceRepository.save(recurrence);

        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_ADDED, "added a", saved);
        eventPublisher.publishEvent(new GroupSessionGenerationEvents.ConfigChanged(groupId));
        return toResponse(saved, location, audienceSummaries(saved.getAudienceUserIds()));
    }

    @Override
    @Transactional
    public GroupSessionRecurrenceResponse updateRecurrence(Long groupId, Long recurrenceId, UUID callerId,
                                                           GroupSessionRecurrenceRequest request) {
        requireManager(groupId, callerId);
        GroupSessionRecurrence recurrence = findRecurrence(groupId, recurrenceId);
        LocationResponse location = apply(recurrence, request, groupId, callerId);

        if (recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(groupId, recurrence.getMode(), recurrence.getDayKey(),
                recurrenceId) >= MAX_PER_DAY) {
            throw dayLimit();
        }
        GroupSessionRecurrence saved = recurrenceRepository.save(recurrence);

        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_UPDATED, "changed the", saved);
        eventPublisher.publishEvent(new GroupSessionGenerationEvents.ConfigChanged(groupId));
        return toResponse(saved, location, audienceSummaries(saved.getAudienceUserIds()));
    }

    @Override
    @Transactional
    public int deleteRecurrence(Long groupId, Long recurrenceId, UUID callerId, boolean cancelScheduled) {
        requireManager(groupId, callerId);
        GroupSessionRecurrence recurrence = findRecurrence(groupId, recurrenceId);
        // SESSION-GROUP-6: the owner may cancel what this configuration left scheduled; otherwise those sessions stay (they keep
        // their recurrence_id, no FK). Cancelling publishes nothing, so no next day is queued.
        int cancelled = cancelScheduled
                ? regularSessionCanceller.cancel(
                        sessionRepository.findByRecurrenceIdAndStatusIn(recurrenceId, RegularSessionCanceller.SCHEDULED_STATUSES),
                        callerId, "Cancelled because the group removed this regular session configuration")
                : 0;
        recurrenceRepository.delete(recurrence);
        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_DELETED, "removed the", recurrence);
        return cancelled;
    }

    @Override
    @Transactional(readOnly = true)
    public RegularSessionsCountResponse countScheduledRegularSessions(Long groupId, UUID callerId, RegularSessionScope scope, Long recurrenceId) {
        requireManager(groupId, callerId);
        long count;
        if (scope == RegularSessionScope.RECURRENCE) {
            if (recurrenceId == null) {
                throw new BadRequestException("recurrenceId is required for scope RECURRENCE");
            }
            findRecurrence(groupId, recurrenceId);
            count = sessionRepository.countByRecurrenceIdAndStatusIn(recurrenceId, RegularSessionCanceller.SCHEDULED_STATUSES);
        } else {
            count = sessionRepository.countByGroupIdAndRecurrenceIdIsNotNullAndStatusIn(groupId, RegularSessionCanceller.SCHEDULED_STATUSES);
        }
        return RegularSessionsCountResponse.builder().count((int) count).build();
    }

    // ---- access ---------------------------------------------------------------------------------------------------

    /** Availability (404) before visibility (403), the resource-access rule: a group that does not exist or is no longer active. */
    private void requireActiveGroup(Long groupId) {
        if (!groupService.isGroupActive(groupId)) {
            throw ResourceNotFoundException.coded("GROUP_NOT_FOUND", "Group not found", null);
        }
    }

    private void requireMember(Long groupId, UUID callerId) {
        requireActiveGroup(groupId);
        if (!groupService.isGroupMember(groupId, callerId)) {
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's session settings", null);
        }
    }

    private void requireManager(Long groupId, UUID callerId) {
        requireActiveGroup(groupId);
        if (!groupService.canManageMembers(groupId, callerId)) {
            // A plain member and a non-member are told apart, as everywhere else in this module.
            if (groupService.isGroupMember(groupId, callerId)) {
                throw new ForbiddenException("SESSION_GROUP_ADMIN_REQUIRED",
                        "Only group owners and admins can change this group's session settings", null);
            }
            throw new ForbiddenException("SESSION_GROUP_MEMBER_REQUIRED", "Only group members can view this group's session settings", null);
        }
    }

    private GroupSessionRecurrence findRecurrence(Long groupId, Long recurrenceId) {
        return recurrenceRepository.findByIdAndGroupId(recurrenceId, groupId)
                .orElseThrow(() -> ResourceNotFoundException.coded("SESSION_RECURRENCE_NOT_FOUND",
                        "Recurrence configuration not found", null));
    }

    private static ConflictException dayLimit() {
        return new ConflictException("SESSION_RECURRENCE_DAY_LIMIT",
                "A group can have at most " + MAX_PER_DAY + " session configurations on one day", Map.of("limit", MAX_PER_DAY));
    }

    // ---- validation and mapping -----------------------------------------------------------------------------------

    /**
     * Validates {@code request} and writes it onto {@code recurrence} (a new, mode-bearing one or an existing one: its mode
     * never changes). The validated members of a {@code SPECIFIC} audience go onto the recurrence itself (null otherwise). Nothing is
     * saved here. Returns the resolved location of the request (null when it names none), already fetched for the sport check, so the
     * response of a create or an update carries it without a second lookup.
     */
    private LocationResponse apply(GroupSessionRecurrence recurrence, GroupSessionRecurrenceRequest request, Long groupId, UUID callerId) {
        RecurrenceMode mode = recurrence.getMode();
        if (!mode.isValidDay(request.getDayKey())) {
            throw new BadRequestException("SESSION_RECURRENCE_DAY_INVALID",
                    "dayKey must be between 1 and " + mode.maxDay() + " for a " + modeWord(mode) + " group", Map.of("mode", mode.name()));
        }
        if (request.getStartTime() == null) {
            throw new BadRequestException("SESSION_RECURRENCE_START_REQUIRED", "startTime is required", null);
        }
        GroupResponse group = groupService.getGroup(groupId, callerId);
        if (group.getSportId() == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "This group has no sport, so it cannot have session configurations", null);
        }
        LocationResponse location = null;
        if (request.getLocationId() != null) {
            location = locationService.getLocation(request.getLocationId());
            if (!group.getSportId().equals(location.getSportId())) {
                throw new BadRequestException("GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH",
                        "locationId does not match this group's sport", null);
            }
        }
        GroupAudience audience = request.getAudience() != null ? request.getAudience() : GroupAudience.ALL_MEMBERS;
        List<UUID> audienceMembers = List.of();
        if (audience == GroupAudience.SPECIFIC) {
            audienceMembers = GroupAudiences.validateSpecific(request.getAudienceUserIds(), null,
                    new HashSet<>(groupService.getMemberUserIds(groupId)));
        }
        FeeType feeType = request.getFeeType() != null ? request.getFeeType() : FeeType.FREE;

        recurrence.setDayKey(request.getDayKey());
        recurrence.setStartTime(request.getStartTime());
        recurrence.setDurationMinutes(request.getDurationMinutes());
        recurrence.setLocationId(request.getLocationId());
        recurrence.setLocationNote(blankToNull(request.getLocationNote()));
        recurrence.setAudience(audience);
        recurrence.setAudienceUserIds(audienceMembers.isEmpty() ? null : audienceMembers);
        recurrence.setFeeType(feeType);
        // The amount is meaningful only for a FIXED fee; a FIXED fee without one makes the configuration a draft.
        recurrence.setFeeAmountVnd(feeType == FeeType.FIXED ? request.getFeeAmountVnd() : null);
        recurrence.setFeeNote(blankToNull(request.getFeeNote()));
        recurrence.setGameMood(request.getGameMood() != null ? request.getGameMood() : 5);
        recurrence.setAttributes(attributeResolver.resolve(request.getAttributes(), group.getSportId()));
        List<String> missing = missingFields(recurrence);
        recurrence.setDraft(!missing.isEmpty());
        return location;
    }

    /** What a complete configuration still lacks: the same readiness a session needs to be scheduled (location, duration, a fixed fee's amount). */
    private static List<String> missingFields(GroupSessionRecurrence recurrence) {
        List<String> missing = new ArrayList<>();
        if (recurrence.getLocationId() == null) {
            missing.add("locationId");
        }
        if (recurrence.getDurationMinutes() == null) {
            missing.add("durationMinutes");
        }
        if (recurrence.getFeeType() == FeeType.FIXED && recurrence.getFeeAmountVnd() == null) {
            missing.add("feeAmountVnd");
        }
        return missing;
    }

    /** Whether the group's sport exists and has statistics switched on (one group read, one cached sport-set read). */
    private boolean statisticsAvailable(Long groupId, UUID callerId) {
        Long groupSportId = groupService.getGroup(groupId, callerId).getSportId();
        return groupSportId != null && sportService.getStatisticsEnabledSportIds().contains(groupSportId);
    }

    private GroupSessionSettingsResponse toSettingsResponse(Long groupId, GroupSessionSettings settings, boolean statisticsAvailable) {
        return GroupSessionSettingsResponse.builder()
                .groupId(groupId)
                .enabled(settings != null && settings.isEnabled())
                .mode(settings != null ? settings.getMode() : RecurrenceMode.WEEKLY)
                .statisticsEnabled(statisticsAvailable ? Boolean.valueOf(settings != null && settings.isStatisticsEnabled()) : null)
                .build();
    }

    /** Name and avatar of the given members in one display lookup (deactivated accounts included, unknown ids absent); no call without ids. */
    private Map<UUID, UserSummaryResponse> audienceSummaries(List<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        return userService.getUserSummariesByIds(userIds);
    }

    private GroupSessionRecurrenceResponse toResponse(GroupSessionRecurrence recurrence, LocationResponse location,
                                                      Map<UUID, UserSummaryResponse> members) {
        return GroupSessionRecurrenceResponse.builder()
                .id(recurrence.getId())
                .groupId(recurrence.getGroupId())
                .mode(recurrence.getMode())
                .dayKey(recurrence.getDayKey())
                .startTime(recurrence.getStartTime())
                .durationMinutes(recurrence.getDurationMinutes())
                .locationId(recurrence.getLocationId())
                .location(location)
                .locationNote(recurrence.getLocationNote())
                .audience(recurrence.getAudience())
                .audienceMembers(audienceMembers(recurrence, members))
                .feeType(recurrence.getFeeType())
                .feeAmountVnd(recurrence.getFeeAmountVnd())
                .feeNote(recurrence.getFeeNote())
                .gameMood(recurrence.getGameMood())
                .attributes(recurrence.getAttributes())
                .draft(recurrence.isDraft())
                .missing(missingFields(recurrence))
                .createdAt(recurrence.getCreatedAt())
                .updatedAt(recurrence.getUpdatedAt())
                .build();
    }

    /** The picked members in their stored order; one whose account cannot be resolved is left out. */
    private static List<GroupSessionAudienceMember> audienceMembers(GroupSessionRecurrence recurrence, Map<UUID, UserSummaryResponse> members) {
        if (recurrence.getAudienceUserIds() == null) {
            return List.of();
        }
        return recurrence.getAudienceUserIds().stream()
                .map(members::get)
                .filter(Objects::nonNull)
                .map(user -> GroupSessionAudienceMember.builder().id(user.getId()).name(user.getFullName()).avatarUrl(user.getAvatarUrl()).build())
                .toList();
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // ---- the group post that tells the members --------------------------------------------------------------------

    private String actorName(UUID actorId) {
        UserSummaryResponse actor = userService.getUserSummariesByIds(List.of(actorId)).get(actorId);
        return actor != null ? actor.getFullName() : "A group admin";
    }

    private static String modeWord(RecurrenceMode mode) {
        return mode == RecurrenceMode.MONTHLY ? "monthly" : "weekly";
    }

    /** "Monday" for a weekly day, "the 15th" for a monthly one: the English fallback text; the client localizes from the params. */
    private static String dayLabel(RecurrenceMode mode, int dayKey) {
        if (mode == RecurrenceMode.WEEKLY) {
            return DayOfWeek.of(dayKey).getDisplayName(TextStyle.FULL, Locale.ENGLISH);
        }
        int lastTwo = dayKey % 100;
        String suffix = (lastTwo >= 11 && lastTwo <= 13) ? "th" : switch (dayKey % 10) {
            case 1 -> "st";
            case 2 -> "nd";
            case 3 -> "rd";
            default -> "th";
        };
        return "the " + dayKey + suffix;
    }

    private static Map<String, String> params(String name, RecurrenceMode mode, Integer dayKey, LocalTime time) {
        Map<String, String> params = new HashMap<>();
        params.put("name", name);
        params.put("mode", mode.name());
        if (dayKey != null) {
            params.put("day", String.valueOf(dayKey));
            params.put("time", time != null ? time.format(TIME_FORMAT) : "");
        }
        return params;
    }

    private void announceRecurrence(Long groupId, UUID actorId, SystemCode code, String verb, GroupSessionRecurrence recurrence) {
        String name = actorName(actorId);
        String when = dayLabel(recurrence.getMode(), recurrence.getDayKey()) + " at " + recurrence.getStartTime().format(TIME_FORMAT);
        announce(groupId, code, name + " " + verb + " " + modeWord(recurrence.getMode()) + " session on " + when,
                params(name, recurrence.getMode(), recurrence.getDayKey(), recurrence.getStartTime()));
    }

    /** Writes the {@code GROUP_SYSTEM} post, authored as the group's current owner (the B9 rule: no system-user account). */
    private void announce(Long groupId, SystemCode code, String content, Map<String, String> params) {
        postService.createSystemPost(groupId, groupService.getGroupOwnerId(groupId), content, code, params);
    }
}
