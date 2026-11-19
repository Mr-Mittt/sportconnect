package com.sportconnect.session.service;

import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-GROUP-1, extracted by SESSION-GROUP-5 so a custom session (created or cancelled by a member) and a generated one
 * tell the same people: who to notify about a group session. Its audience (every current member, or, for a {@code SPECIFIC}
 * audience, the chosen ones who are still members; a session with no stored audience reads as all members), plus, with
 * {@code includeJoined}, anyone still {@code JOINED}. Never the actor; active accounts only (the new-interaction rule: one
 * ids-only query, never a user row per person). Group size is capped (500), so the lists are bounded.
 */
@Component
@RequiredArgsConstructor
public class GroupSessionRecipients {

    private final GroupService groupService;
    private final SessionParticipantRepository sessionParticipantRepository;
    private final UserService userService;

    public List<UUID> of(Session session, UUID actorId, boolean includeJoined) {
        Set<UUID> members = new HashSet<>(groupService.getMemberUserIds(session.getGroupId()));
        Set<UUID> ids = new LinkedHashSet<>();
        if (session.getGroupAudience() == GroupAudience.SPECIFIC) {
            // The chosen members are kept on the session itself; a chosen member who has left the group is dropped here.
            List<UUID> chosen = session.getGroupAudienceUserIds();
            if (chosen != null) {
                chosen.stream().filter(members::contains).forEach(ids::add);
            }
        } else {
            ids.addAll(members);
        }
        if (includeJoined) {
            sessionParticipantRepository.findBySessionIdAndStatusIn(session.getId(), List.of(ParticipantStatus.JOINED))
                    .forEach(participant -> ids.add(participant.getUserId()));
        }
        ids.remove(actorId);
        if (ids.isEmpty()) {
            return List.of();
        }
        Set<UUID> active = userService.getActiveUserIds(new ArrayList<>(ids));
        return ids.stream().filter(active::contains).toList();
    }
}
