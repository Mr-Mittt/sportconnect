package com.sportconnect.session.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * SESSION-40 — gates {@code GET /api/sessions/{sessionId}} (the single-item detail read), a
 * genuinely different rule from {@link SessionGate} (which gates the comment thread/like — out
 * of scope to change here, per this ticket). {@code SessionGate}'s rule is purely
 * relationship-based (participant, or group member) and has no concept of a session's own
 * {@code isPublic} flag at all; this gate adds an {@code isPublic} escape hatch on top of that
 * same relationship check, since viewing basic session details is a lower bar than commenting.
 *
 * <p><b>Why two separate {@link ResourceGate}&lt;{@link Session}&gt; beans for one entity,
 * instead of widening {@code SessionGate} itself:</b> the two features (detail view vs.
 * comments/likes) have always had — and per this ticket's own scope, must keep — different
 * visibility rules for the same entity. Keeping them as separate, independently testable gates
 * makes that divergence explicit rather than folding a feature-specific branch into
 * {@code SessionGate}'s single rule.
 *
 * <p>Deliberately duplicates {@link SessionGate#isAvailable}'s check rather than sharing it —
 * two lines, and this module's existing gates already don't share logic with each other (see
 * {@code SessionGate}'s own Javadoc re: {@code post-impl}'s {@code PostGate}); not worth a shared
 * helper for this.
 */
@Component
@RequiredArgsConstructor
public class SessionDetailGate implements ResourceGate<Session> {

    private final GroupService groupService;
    private final SessionParticipantRepository sessionParticipantRepository;

    /**
     * Existence/lifecycle only, same rule as {@link SessionGate#isAvailable}: a group-linked
     * session is unavailable if its group is no longer active. Assumes {@code session} was
     * already resolved from the DB ({@code null} here means "not found" upstream).
     */
    @Override
    public boolean isAvailable(Session session) {
        if (session == null) {
            return false;
        }
        return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
    }

    /**
     * {@code isPublic OR} a type-specific relationship: for a standalone session, the caller
     * holds a participant row in {@code JOINED}/{@code REQUESTED}/{@code INVITED} (same statuses
     * {@link SessionGate} treats as "has access" — {@code LEFT} doesn't count); for a
     * group-linked session, the caller is a member of the parent group (membership alone, not
     * gated by the caller's own participant status in the session itself — matches
     * {@code getGroupSessions}' own list-level gate, which grants any member visibility into the
     * group's sessions regardless of whether they've personally joined each one).
     *
     * <p>A group-linked session always has {@code isPublic = false} (set at creation), so it needs membership. A standalone
     * session is public by default and open to everyone; since SESSION-69 its host can make it private, and then only the
     * participant-status clause lets anyone but the creator in (an invitee, or someone who asked to join before it went
     * private). That clause was dormant until then; this rule did not need rewriting.
     */
    /**
     * SESSION-69: does this participant row keep its holder inside a private standalone session? {@code JOINED},
     * {@code REQUESTED} and {@code INVITED} do ({@code LEFT} does not, which also covers a rejected request). The one
     * definition, shared with {@code joinSession}.
     */
    public static boolean grantsAccess(SessionParticipant participant) {
        return participant.getStatus() == ParticipantStatus.JOINED
                || participant.getStatus() == ParticipantStatus.REQUESTED
                || participant.getStatus() == ParticipantStatus.INVITED;
    }

    @Override
    public boolean isVisibleTo(Session session, UUID viewerId) {
        if (viewerId == null) {
            return false;
        }
        if (Boolean.TRUE.equals(session.getIsPublic())) {
            return true;
        }
        if (session.getGroupId() == null) {
            return sessionParticipantRepository.findBySessionIdAndUserId(session.getId(), viewerId)
                    .filter(SessionDetailGate::grantsAccess)
                    .isPresent();
        }
        return groupService.isGroupMember(session.getGroupId(), viewerId);
    }
}
