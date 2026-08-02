package com.sportconnect.session.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.service.SessionService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionServiceImpl implements SessionService {

    private final SessionRepository sessionRepository;
    private final SessionParticipantRepository sessionParticipantRepository;
    private final GroupService groupService;
    private final LocationService locationService;
    private final UserService userService;
    private final SportService sportService;
    private final UserSportProfileService userSportProfileService;

    @Override
    @Transactional
    public SessionResponse createSession(UUID userId, CreateSessionRequest request) {
        Long groupId = request.getGroupId();
        Long sportId;
        SessionType sessionType;

        if (groupId != null) {
            if (!groupService.canManageMembers(groupId, userId)) {
                throw new BadRequestException("Only group owners and admins can create sessions for this group");
            }
            GroupResponse group = groupService.getGroup(groupId, userId);
            sportId = request.getSportId() != null ? request.getSportId() : group.getSportId();
            sessionType = SessionType.GROUP_RECURRING;
        } else {
            if (request.getSportId() == null) {
                throw new BadRequestException("sportId is required for a standalone session");
            }
            sportId = request.getSportId();
            sessionType = SessionType.STANDALONE;
        }

        LocationResponse location = locationService.getLocation(request.getLocationId());
        if (!Objects.equals(location.getSportId(), sportId)) {
            throw new BadRequestException("locationId does not match this session's sport");
        }

        LocalDateTime scheduledEndAt = request.getDurationMinutes() != null
                ? request.getScheduledStart().plusMinutes(request.getDurationMinutes())
                : null;

        Session session = Session.builder()
                .groupId(groupId)
                .sessionType(sessionType)
                .createdBy(userId)
                .sportId(sportId)
                .title(request.getTitle())
                .description(request.getDescription())
                .locationId(request.getLocationId())
                .locationNote(request.getLocationNote())
                .scheduledStart(request.getScheduledStart())
                .scheduledEndAt(scheduledEndAt)
                .status(SessionStatus.SCHEDULED)
                .build();

        Session saved = sessionRepository.save(session);
        log.info("Created session {} (type={}, group={})", saved.getId(), saved.getSessionType(), saved.getGroupId());
        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public SessionResponse getSession(Long sessionId) {
        return toResponse(findSessionOrThrow(sessionId));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getGroupSessions(Long groupId, UUID currentUserId, Pageable pageable) {
        // Enforces the existing private-group membership gate rather than reimplementing it.
        groupService.getGroup(groupId, currentUserId);
        return toResponsePage(sessionRepository.findByGroupId(groupId, pageable));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getSessionsCreatedByUser(UUID userId, Pageable pageable) {
        return toResponsePage(sessionRepository.findByCreatedByAndGroupIdIsNull(userId, pageable));
    }

    @Override
    @Transactional
    public SessionResponse updateSession(Long sessionId, UUID userId, UpdateSessionRequest request) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, userId);

        if (request.getTitle() != null) {
            session.setTitle(request.getTitle());
        }
        if (request.getDescription() != null) {
            session.setDescription(request.getDescription());
        }
        if (request.getLocationId() != null) {
            LocationResponse location = locationService.getLocation(request.getLocationId());
            if (!Objects.equals(location.getSportId(), session.getSportId())) {
                throw new BadRequestException("locationId does not match this session's sport");
            }
            session.setLocationId(request.getLocationId());
        }
        if (request.getLocationNote() != null) {
            session.setLocationNote(request.getLocationNote());
        }
        if (request.getScheduledStart() != null) {
            session.setScheduledStart(request.getScheduledStart());
        }
        if (request.getDurationMinutes() != null) {
            session.setScheduledEndAt(session.getScheduledStart().plusMinutes(request.getDurationMinutes()));
        }

        return toResponse(sessionRepository.save(session));
    }

    @Override
    @Transactional
    public SessionResponse cancelSession(Long sessionId, UUID userId, CancelSessionRequest request) {
        Session session = findSessionOrThrow(sessionId);
        requireCanModify(session, userId);
        if (session.getStatus() == SessionStatus.COMPLETED || session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot cancel a session that is already " + session.getStatus());
        }

        session.setStatus(SessionStatus.CANCELLED);
        session.setCancelReason(request != null ? request.getReason() : null);
        session.setCancelledBy(userId);
        session.setCancelledAt(LocalDateTime.now());

        return toResponse(sessionRepository.save(session));
    }

    @Override
    @Transactional
    public void joinSession(Long sessionId, UUID userId) {
        Session session = findSessionOrThrow(sessionId);
        if (session.getStatus() == SessionStatus.CANCELLED) {
            throw new BadRequestException("Cannot join a cancelled session");
        }
        if (session.getGroupId() != null && !groupService.isGroupMember(session.getGroupId(), userId)) {
            throw new BadRequestException("Only group members can join this session");
        }

        SessionParticipant participant = sessionParticipantRepository
                .findBySessionIdAndUserId(sessionId, userId)
                .orElseGet(() -> SessionParticipant.builder()
                        .sessionId(sessionId)
                        .userId(userId)
                        .build());
        participant.setStatus(ParticipantStatus.JOINED);
        sessionParticipantRepository.save(participant);
    }

    @Override
    @Transactional
    public void leaveSession(Long sessionId, UUID userId) {
        SessionParticipant participant = sessionParticipantRepository
                .findBySessionIdAndUserId(sessionId, userId)
                .filter(p -> p.getStatus() == ParticipantStatus.JOINED)
                .orElseThrow(() -> new BadRequestException("Not currently joined to this session"));
        participant.setStatus(ParticipantStatus.LEFT);
        sessionParticipantRepository.save(participant);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionParticipantResponse> getSessionParticipants(Long sessionId, Pageable pageable) {
        Page<SessionParticipant> participants = sessionParticipantRepository
                .findBySessionIdAndStatus(sessionId, ParticipantStatus.JOINED, pageable);

        List<UUID> userIds = participants.getContent().stream()
                .map(SessionParticipant::getUserId)
                .distinct()
                .collect(Collectors.toList());
        Map<UUID, UserResponse> users = userIds.isEmpty() ? Collections.emptyMap() : userService.getUsersByIds(userIds);

        return participants.map(p -> {
            UserResponse user = users.get(p.getUserId());
            return SessionParticipantResponse.builder()
                    .id(p.getId())
                    .sessionId(p.getSessionId())
                    .userId(p.getUserId())
                    .userFullName(user != null ? user.getFullName() : null)
                    .userAvatarUrl(user != null ? user.getAvatarUrl() : null)
                    .status(p.getStatus())
                    .createdAt(p.getCreatedAt())
                    .build();
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> discoverSessions(UUID callerId, Long sportId, Pageable pageable) {
        List<Long> activeSportIds = userSportProfileService.getUserProfiles(callerId).stream()
                .map(UserSportProfileResponse::getSportId)
                .distinct()
                .collect(Collectors.toList());

        List<Long> effectiveSportIds = sportId != null
                ? (activeSportIds.contains(sportId) ? List.of(sportId) : List.of())
                : activeSportIds;

        if (effectiveSportIds.isEmpty()) {
            return Page.empty(pageable);
        }

        Page<Session> sessions = sessionRepository.findDiscoverSessions(
                SessionStatus.SCHEDULED, effectiveSportIds, callerId, ParticipantStatus.JOINED, pageable);
        return toResponsePage(sessions);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SessionResponse> getJoinedSessions(UUID userId, SessionStatus status, Pageable pageable) {
        Page<Session> sessions = sessionRepository.findJoinedSessionsByStatus(
                status, userId, ParticipantStatus.JOINED, pageable);
        return toResponsePage(sessions);
    }

    private Session findSessionOrThrow(Long sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session", "id", sessionId));
    }

    private void requireCanModify(Session session, UUID userId) {
        if (session.getGroupId() == null) {
            if (!session.getCreatedBy().equals(userId)) {
                throw new BadRequestException("Only the creator can modify this session");
            }
        } else if (!groupService.canManageMembers(session.getGroupId(), userId)) {
            throw new BadRequestException("Only group owners and admins can modify this session");
        }
    }

    private SessionResponse toResponse(Session session) {
        return mapToResponses(List.of(session)).get(0);
    }

    private Page<SessionResponse> toResponsePage(Page<Session> sessions) {
        List<SessionResponse> mapped = mapToResponses(sessions.getContent());
        return new PageImpl<>(mapped, sessions.getPageable(), sessions.getTotalElements());
    }

    /**
     * Batch-resolves creator/sport/location/participant-count for a list of sessions in one
     * round trip each — never per-row calls in a loop, per the no-N+1 rule.
     */
    private List<SessionResponse> mapToResponses(List<Session> sessions) {
        if (sessions.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> userIds = sessions.stream()
                .flatMap(s -> Stream.of(s.getCreatedBy(), s.getCancelledBy()))
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        List<Long> sportIds = sessions.stream().map(Session::getSportId).distinct().collect(Collectors.toList());
        List<Long> locationIds = sessions.stream().map(Session::getLocationId).distinct().collect(Collectors.toList());
        List<Long> sessionIds = sessions.stream().map(Session::getId).collect(Collectors.toList());

        Map<UUID, UserResponse> users = userService.getUsersByIds(userIds);
        Map<Long, SportResponse> sports = sportIds.isEmpty() ? Collections.emptyMap() : sportService.getSportsByIds(sportIds);
        Map<Long, LocationResponse> locations = locationService.getLocationsByIds(locationIds);
        Map<Long, Long> participantCounts = sessionParticipantRepository
                .countBySessionIdsAndStatus(sessionIds, ParticipantStatus.JOINED).stream()
                .collect(Collectors.toMap(
                        SessionParticipantRepository.SessionParticipantCount::getSessionId,
                        SessionParticipantRepository.SessionParticipantCount::getCount));

        return sessions.stream()
                .map(session -> SessionResponse.builder()
                        .id(session.getId())
                        .groupId(session.getGroupId())
                        .sessionType(session.getSessionType())
                        .createdBy(session.getCreatedBy())
                        .createdByFullName(Optional.ofNullable(users.get(session.getCreatedBy()))
                                .map(UserResponse::getFullName).orElse(null))
                        .sportId(session.getSportId())
                        .sportName(Optional.ofNullable(session.getSportId())
                                .map(sports::get).map(SportResponse::getName).orElse(null))
                        .title(session.getTitle())
                        .description(session.getDescription())
                        .location(locations.get(session.getLocationId()))
                        .locationNote(session.getLocationNote())
                        .scheduledStart(session.getScheduledStart())
                        .scheduledEndAt(session.getScheduledEndAt())
                        .status(session.getStatus())
                        .cancelReason(session.getCancelReason())
                        .cancelledBy(session.getCancelledBy())
                        .cancelledByFullName(Optional.ofNullable(session.getCancelledBy())
                                .map(users::get).map(UserResponse::getFullName).orElse(null))
                        .cancelledAt(session.getCancelledAt())
                        .participantCount(participantCounts.getOrDefault(session.getId(), 0L))
                        .createdAt(session.getCreatedAt())
                        .updatedAt(session.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
