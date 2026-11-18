package com.sportconnect.session.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * SESSION-66 — gates {@code POST /api/sessions/{sessionId}/shares}. Its own gate because the rule differs from
 * {@link SessionGate} (comments, likes), {@link SessionDetailGate} (public detail) and the records gate: only a
 * {@code JOINED} participant of a <b>standalone</b> session may share it. {@code REQUESTED} and {@code INVITED}
 * participants may not (they have not been accepted yet), and a group session is not shareable here at all (the group
 * and group-session chain comes after the standalone one), so it is not visible to anyone for this action.
 */
@Component
@RequiredArgsConstructor
public class SessionShareGate implements ResourceGate<Session> {

    private final GroupService groupService;
    private final SessionParticipantRepository sessionParticipantRepository;

    /** Available unless the session is missing or its parent group is no longer active. */
    @Override
    public boolean isAvailable(Session session) {
        if (session == null) {
            return false;
        }
        return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
    }

    /** A standalone session and a {@code JOINED} row for the viewer (the host of a standalone session has one). */
    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        if (viewerId == null || session.getGroupId() != null) {
            return false;
        }
        return sessionParticipantRepository.findBySessionIdAndUserId(session.getId(), viewerId)
                .filter(p -> p.getStatus() == ParticipantStatus.JOINED)
                .isPresent();
    }
}
