package com.sportconnect.session.season;

import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-55: writes the {@code GROUP_SYSTEM} post that tells a group about its season (created, started, finalised, cancelled), authored
 * as the group's current owner (the B9 rule: no system user). It writes in the caller's transaction, so the change and its announcement
 * are never left without each other. The English text is the fallback until the client has its en/vi copy for the code. The dates in the
 * params are read in the group's timezone at the moment of writing (the season stores instants only), so a post written by the status job,
 * which has no caller, reads the group as its owner; a group whose region has no timezone gets the dates read in UTC.
 */
@Component
@RequiredArgsConstructor
class SeasonAnnouncer {

    private final PostService postService;
    private final GroupService groupService;

    /** @param by the name of whoever did it, or {@code null} for a change the status job made (the "started" and "finalised" posts) */
    void announce(GroupSeason season, SystemCode code, String by) {
        String verb = switch (code) {
            case GROUP_SEASON_CREATED -> "created";
            case GROUP_SEASON_STARTED -> "started";
            case GROUP_SEASON_FINALISED -> "finalised";
            case GROUP_SEASON_CANCELLED -> "cancelled";
            default -> throw new IllegalArgumentException("Not a season code: " + code);
        };
        UUID ownerId = groupService.getGroupOwnerId(season.getGroupId());
        ZoneId zone = zoneOf(groupService.getGroup(season.getGroupId(), ownerId));
        String startDate = SeasonDates.startDate(season.getStartAt(), zone).toString();
        String endDate = SeasonDates.endDate(season.getEndAt(), zone).toString();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("name", season.getName());
        params.put("startDate", startDate);
        params.put("endDate", endDate);
        if (by != null) {
            params.put("by", by);
        }
        String content = "Season " + season.getName() + " (" + startDate + " to " + endDate + ") " + verb;
        postService.createSystemPost(season.getGroupId(), ownerId, content, code, params);
    }

    private static ZoneId zoneOf(GroupResponse group) {
        String timezone = group.getTimezone();
        if (timezone == null || timezone.isBlank()) {
            return ZoneId.of("UTC");
        }
        try {
            return ZoneId.of(timezone);
        } catch (DateTimeException e) {
            return ZoneId.of("UTC");
        }
    }
}
