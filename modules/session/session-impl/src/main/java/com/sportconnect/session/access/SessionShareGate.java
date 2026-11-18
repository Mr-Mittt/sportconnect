package com.sportconnect.session.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.entity.Session;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * SESSION-66 — gates {@code POST /api/sessions/{sessionId}/shares}. Its own gate because the rule differs from
 * {@link SessionGate} (comments, likes), {@link SessionDetailGate} (public detail) and the records gate: any caller may
 * share a <b>standalone</b> session, whatever the session's status and whatever the caller's own participation (joined,
 * requested, invited, left, or not in it at all; corrected by CLIENT-SESSION-49, which first asked for a {@code JOINED}
 * participant of a {@code PREPARING}/{@code SCHEDULED} session). A <b>private</b> standalone session is not shareable (SESSION-69,
 * owner): a friend it was shared with could not open it, so it is not visible to anyone for this action. SESSION-GROUP-3
 * (owner, 2026-11-19): a <b>group</b> session is shareable by any member of the group, in any status; a non-member of the
 * group cannot, since they could not open the session either.
 */
@Component
@RequiredArgsConstructor
public class SessionShareGate implements ResourceGate<Session> {

    private final GroupService groupService;

    /** Available unless the session is missing or its parent group is no longer active. */
    @Override
    public boolean isAvailable(Session session) {
        if (session == null) {
            return false;
        }
        return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
    }

    /** Any identified viewer of a public standalone session; a member of the group for a group session; nobody for a private one. */
    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        if (viewerId == null) {
            return false;
        }
        if (session.getGroupId() != null) {
            return groupService.isGroupMember(session.getGroupId(), viewerId);
        }
        return Boolean.TRUE.equals(session.getIsPublic());
    }
}
