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
import com.sportconnect.session.api.dto.GroupSessionRecurrenceRequest;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceResponse;
import com.sportconnect.session.api.dto.GroupSessionSettingsResponse;
import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest;
import com.sportconnect.session.api.service.GroupSessionConfigService;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import com.sportconnect.session.entity.GroupSessionRecurrenceMember;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.repository.GroupSessionRecurrenceMemberRepository;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
    private final GroupSessionRecurrenceMemberRepository memberRepository;
    private final GroupService groupService;
    private final LocationService locationService;
    private final PostService postService;
    private final UserService userService;
    private final SessionAttributeResolver attributeResolver;

    // ---- settings -------------------------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public GroupSessionSettingsResponse getSettings(Long groupId, UUID callerId) {
        requireMember(groupId, callerId);
        return toSettingsResponse(groupId, settingsRepository.findById(groupId).orElse(null));
    }

    @Override
    @Transactional
    public GroupSessionSettingsResponse updateSettings(Long groupId, UUID callerId, UpdateGroupSessionSettingsRequest request) {
        requireManager(groupId, callerId);
        GroupSessionSettings existing = settingsRepository.findById(groupId).orElse(null);
        boolean currentEnabled = existing != null && existing.isEnabled();
        RecurrenceMode currentMode = existing != null ? existing.getMode() : RecurrenceMode.WEEKLY;

        boolean enabledChanged = request.getEnabled() != null && request.getEnabled() != currentEnabled;
        boolean modeChanged = request.getMode() != null && request.getMode() != currentMode;
        if (!enabledChanged && !modeChanged) {
            // Nothing to change: no row is created for a no-op, no post is written.
            return toSettingsResponse(groupId, existing);
        }

        GroupSessionSettings settings = existing != null ? existing : GroupSessionSettings.builder().groupId(groupId).build();
        if (enabledChanged) {
            settings.setEnabled(request.getEnabled());
        }
        if (modeChanged) {
            settings.setMode(request.getMode());
        }
        GroupSessionSettings saved = settingsRepository.save(settings);

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
        log.info("Group {} session settings changed by {}: enabled={}, mode={}", groupId, callerId, saved.isEnabled(), saved.getMode());
        return toSettingsResponse(groupId, saved);
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
        // One query for every chosen member of every recurrence, never one per recurrence.
        Map<Long, List<UUID>> membersByRecurrence = memberRepository
                .findByRecurrenceIdIn(recurrences.stream().map(GroupSessionRecurrence::getId).toList()).stream()
                .collect(Collectors.groupingBy(GroupSessionRecurrenceMember::getRecurrenceId,
                        Collectors.mapping(GroupSessionRecurrenceMember::getUserId, Collectors.toList())));
        return recurrences.stream()
                .map(recurrence -> toResponse(recurrence, membersByRecurrence.getOrDefault(recurrence.getId(), List.of())))
                .toList();
    }

    @Override
    @Transactional
    public GroupSessionRecurrenceResponse createRecurrence(Long groupId, UUID callerId, GroupSessionRecurrenceRequest request) {
        requireManager(groupId, callerId);
        RecurrenceMode mode = settingsRepository.findById(groupId).map(GroupSessionSettings::getMode).orElse(RecurrenceMode.WEEKLY);
        GroupSessionRecurrence recurrence = GroupSessionRecurrence.builder().groupId(groupId).mode(mode).build();
        List<UUID> audienceMembers = apply(recurrence, request, groupId, callerId);

        if (recurrenceRepository.countByGroupIdAndModeAndDayKey(groupId, mode, recurrence.getDayKey()) >= MAX_PER_DAY) {
            throw dayLimit();
        }
        GroupSessionRecurrence saved = recurrenceRepository.save(recurrence);
        saveMembers(saved.getId(), audienceMembers);

        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_ADDED, "added a", saved);
        return toResponse(saved, audienceMembers);
    }

    @Override
    @Transactional
    public GroupSessionRecurrenceResponse updateRecurrence(Long groupId, Long recurrenceId, UUID callerId,
                                                           GroupSessionRecurrenceRequest request) {
        requireManager(groupId, callerId);
        GroupSessionRecurrence recurrence = findRecurrence(groupId, recurrenceId);
        List<UUID> audienceMembers = apply(recurrence, request, groupId, callerId);

        if (recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(groupId, recurrence.getMode(), recurrence.getDayKey(),
                recurrenceId) >= MAX_PER_DAY) {
            throw dayLimit();
        }
        GroupSessionRecurrence saved = recurrenceRepository.save(recurrence);
        // The unique (recurrence, user) key forbids inserting a kept member before the old row is deleted, and Hibernate runs
        // inserts before deletes: flush the delete first.
        memberRepository.deleteByRecurrenceId(recurrenceId);
        memberRepository.flush();
        saveMembers(recurrenceId, audienceMembers);

        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_UPDATED, "changed the", saved);
        return toResponse(saved, audienceMembers);
    }

    @Override
    @Transactional
    public void deleteRecurrence(Long groupId, Long recurrenceId, UUID callerId) {
        requireManager(groupId, callerId);
        GroupSessionRecurrence recurrence = findRecurrence(groupId, recurrenceId);
        memberRepository.deleteByRecurrenceId(recurrenceId);
        recurrenceRepository.delete(recurrence);
        announceRecurrence(groupId, callerId, SystemCode.GROUP_SESSION_RECURRENCE_DELETED, "removed the", recurrence);
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
     * never changes). Returns the validated members of a {@code SPECIFIC} audience, empty otherwise. Nothing is saved here.
     */
    private List<UUID> apply(GroupSessionRecurrence recurrence, GroupSessionRecurrenceRequest request, Long groupId, UUID callerId) {
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
        if (request.getLocationId() != null) {
            LocationResponse location = locationService.getLocation(request.getLocationId());
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
        recurrence.setFeeType(feeType);
        // The amount is meaningful only for a FIXED fee; a FIXED fee without one makes the configuration a draft.
        recurrence.setFeeAmountVnd(feeType == FeeType.FIXED ? request.getFeeAmountVnd() : null);
        recurrence.setFeeNote(blankToNull(request.getFeeNote()));
        recurrence.setGameMood(request.getGameMood() != null ? request.getGameMood() : 5);
        recurrence.setAttributes(attributeResolver.resolve(request.getAttributes(), group.getSportId()));
        List<String> missing = missingFields(recurrence);
        recurrence.setDraft(!missing.isEmpty());
        return audienceMembers;
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

    private void saveMembers(Long recurrenceId, List<UUID> memberIds) {
        if (!memberIds.isEmpty()) {
            memberRepository.saveAll(memberIds.stream()
                    .map(userId -> GroupSessionRecurrenceMember.builder().recurrenceId(recurrenceId).userId(userId).build())
                    .toList());
        }
    }

    private GroupSessionSettingsResponse toSettingsResponse(Long groupId, GroupSessionSettings settings) {
        return GroupSessionSettingsResponse.builder()
                .groupId(groupId)
                .enabled(settings != null && settings.isEnabled())
                .mode(settings != null ? settings.getMode() : RecurrenceMode.WEEKLY)
                .build();
    }

    private GroupSessionRecurrenceResponse toResponse(GroupSessionRecurrence recurrence, List<UUID> audienceMembers) {
        return GroupSessionRecurrenceResponse.builder()
                .id(recurrence.getId())
                .groupId(recurrence.getGroupId())
                .mode(recurrence.getMode())
                .dayKey(recurrence.getDayKey())
                .startTime(recurrence.getStartTime())
                .durationMinutes(recurrence.getDurationMinutes())
                .locationId(recurrence.getLocationId())
                .locationNote(recurrence.getLocationNote())
                .audience(recurrence.getAudience())
                .audienceUserIds(audienceMembers)
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
