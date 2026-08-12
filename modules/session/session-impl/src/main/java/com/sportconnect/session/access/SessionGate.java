package com.sportconnect.session.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * {@code session-impl}'s own {@link ResourceGate} implementation, gating access to a session's
 * comment thread (SESSION-10/A17) — same shape as {@code post-impl}'s {@code PostGate}, no shared
 * logic. This is the {@code SessionGate} the original ADR
 * ({@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md} §6) specced, finally realized once the
 * design moved to a one-way {@code session-impl -> post-api} dependency: {@code post-impl} never
 * calls into {@code session-api} for gating (its own {@code PostGate} makes {@code SESSION_POST}
 * unconditionally unavailable), so this gate is the only thing standing between a caller and a
 * session's comments — {@code SessionServiceImpl}'s comment-proxy methods call
 * {@code require(...)} here, then delegate to {@code CommentService}'s bypass methods.
 */
@Component
@RequiredArgsConstructor
public class SessionGate implements ResourceGate<Session> {

    private final GroupService groupService;
    private final SessionParticipantRepository sessionParticipantRepository;

    /**
     * Existence/lifecycle only — assumes {@code session} was already resolved from the DB (a
     * {@code null} here means "not found" upstream); the one thing left to check is the parent
     * chain: a group-linked session is unavailable if its group is no longer active (B18).
     */
    @Override
    public boolean isAvailable(Session session) {
        if (session == null) {
            return false;
        }
        return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
    }

    /**
     * Participant (JOINED/REQUESTED/INVITED — {@code LEFT} loses access) or, for a group-linked
     * session, a member of the parent group — the ADR §6 widened rule. Standalone sessions are
     * strictly participant-only, unchanged from {@code SESSION_COMMENTS_VISION.md}'s original
     * decision.
     */
    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        if (viewerId == null) {
            return false;
        }
        boolean isParticipant = sessionParticipantRepository.findBySessionIdAndUserId(session.getId(), viewerId)
                .filter(p -> p.getStatus() == ParticipantStatus.JOINED
                        || p.getStatus() == ParticipantStatus.REQUESTED
                        || p.getStatus() == ParticipantStatus.INVITED)
                .isPresent();
        return isParticipant
                || (session.getGroupId() != null && groupService.isGroupMember(session.getGroupId(), viewerId));
    }
}
