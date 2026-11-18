package com.sportconnect.session.service;

import com.sportconnect.common.exception.BadRequestException;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-GROUP-1, extracted by SESSION-GROUP-4: the rule for the members of a {@code SPECIFIC} audience, shared by a custom
 * group session and a recurrence configuration. Pure logic: the caller passes the group's member ids (one
 * {@code GroupService.getMemberUserIds} call, never a check per id).
 */
final class GroupAudiences {

    private GroupAudiences() {
    }

    /**
     * The validated members of a {@code SPECIFIC} audience: distinct, without {@code excludedId} (a session's creator; null
     * to exclude nobody), at least one (400 {@code SESSION_AUDIENCE_REQUIRED}), and every one a member of the group (400
     * {@code SESSION_AUDIENCE_NOT_MEMBER} with the number of those who are not). No upper limit.
     */
    static List<UUID> validateSpecific(List<UUID> requested, UUID excludedId, Set<UUID> groupMembers) {
        List<UUID> ids = requested == null ? List.of()
                : requested.stream().filter(Objects::nonNull).filter(id -> !id.equals(excludedId)).distinct().toList();
        if (ids.isEmpty()) {
            throw new BadRequestException("SESSION_AUDIENCE_REQUIRED",
                    "Choose at least one group member to notify, or notify all members", null);
        }
        long notMembers = ids.stream().filter(id -> !groupMembers.contains(id)).count();
        if (notMembers > 0) {
            throw new BadRequestException("SESSION_AUDIENCE_NOT_MEMBER",
                    "Every person to notify must be a member of the group", Map.of("count", notMembers));
        }
        return ids;
    }
}
