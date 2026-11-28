package com.sportconnect.session.season;

import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.api.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SESSION-55: writes the {@code GROUP_SYSTEM} post that tells a group about its season (created, started, finalised, cancelled), authored
 * as the group's current owner (the B9 rule: no system user). It writes in the caller's transaction, so the change and its announcement
 * are never left without each other. The English text is the fallback until the client has its en/vi copy for the code.
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
        Map<String, String> params = new LinkedHashMap<>();
        params.put("name", season.getName());
        params.put("startDate", season.getStartDate().toString());
        params.put("endDate", season.getEndDate().toString());
        if (by != null) {
            params.put("by", by);
        }
        String content = "Season " + season.getName() + " (" + season.getStartDate() + " to " + season.getEndDate() + ") " + verb;
        postService.createSystemPost(season.getGroupId(), groupService.getGroupOwnerId(season.getGroupId()), content, code, params);
    }
}
