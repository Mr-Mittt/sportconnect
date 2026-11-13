package com.sportconnect.session.record;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * SESSION-50: gates a session's result records. Kept apart from {@code SessionGate} (comments, likes)
 * and {@code SessionDetailGate} (public detail) because the rule differs: a group session's results
 * are open to its group members, a standalone session's only to {@code JOINED} participants.
 * {@code REQUESTED} and {@code INVITED} participants see nothing, in either kind of session.
 */
@Component
@RequiredArgsConstructor
public class SessionRecordGate implements ResourceGate<Session> {

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

    /**
     * Group session: a member of the group (not necessarily a participant). Standalone session: a
     * {@code JOINED} participant.
     */
    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        if (viewerId == null) {
            return false;
        }
        if (session.getGroupId() != null) {
            return groupService.isGroupMember(session.getGroupId(), viewerId);
        }
        return sessionParticipantRepository.findBySessionIdAndUserId(session.getId(), viewerId)
                .filter(p -> p.getStatus() == ParticipantStatus.JOINED)
                .isPresent();
    }
}
