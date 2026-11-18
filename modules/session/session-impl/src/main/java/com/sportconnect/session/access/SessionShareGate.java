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
 * participant of a {@code PREPARING}/{@code SCHEDULED} session). A group session is not shareable here at all (the group
 * and group-session chain comes after the standalone one), and neither is a <b>private</b> standalone session (SESSION-69,
 * owner): a friend it was shared with could not open it. Both are not visible to anyone for this action.
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

    /** Any identified viewer of a public standalone session; nobody for a group session or a private one (SESSION-69). */
    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        return viewerId != null && session.getGroupId() == null && Boolean.TRUE.equals(session.getIsPublic());
    }
}
