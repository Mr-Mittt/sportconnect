package com.sportconnect.session.season;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * SESSION-55: the one gate on a season's reads and on its discussion thread (post-impl never decides: its {@code PostGate} makes a
 * {@code SEASON_POST} unavailable for everyone, like a {@code SESSION_POST}). Same two questions as every resource, in this order:
 * is it <b>available</b> (the season exists and its group is still active) and is it <b>visible</b> to this caller (a member of the
 * group). Service layer; a shape shared through {@link ResourceGate}, never shared logic.
 */
@Component
@RequiredArgsConstructor
public class SeasonGate implements ResourceGate<GroupSeason> {

    private final GroupService groupService;

    @Override
    public boolean isAvailable(GroupSeason season) {
        return season != null && groupService.isGroupActive(season.getGroupId());
    }

    @Override
    public boolean isVisibleTo(GroupSeason season, UUID viewerId) {
        return viewerId != null && groupService.isGroupMember(season.getGroupId(), viewerId);
    }
}
