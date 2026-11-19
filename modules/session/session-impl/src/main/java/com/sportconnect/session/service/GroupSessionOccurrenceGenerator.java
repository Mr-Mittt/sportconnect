package com.sportconnect.session.service;

import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.event.SessionGroupCreatedEvent;
import com.sportconnect.session.entity.GroupSessionGenerationItem;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-GROUP-5 — generates one queued slot, or records why it failed. Each call is its own transaction
 * ({@code REQUIRES_NEW}), so one failing slot can never undo another's work or the change that queued it. Called by
 * {@link GroupSessionGenerationRunner} (a separate bean, so the proxy applies).
 *
 * <p>A slot is generated from the recurrence <b>as it is now</b> (an edit made after it was queued applies), as a session of
 * the group's current owner: {@code SCHEDULED} when it starts in the future, {@code ONGOING} when it is already under way,
 * and skipped when it has already ended. It is skipped (queue row {@code DONE}) when the recurrence is gone or a draft,
 * generation is off or the group is in another mode, the group is inactive, or the session already exists.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupSessionOccurrenceGenerator {

    /** Minutes to wait before attempt 2, 3, 4 and 5; after the fifth failure the slot is {@code FAILED}. */
    private static final int[] BACKOFF_MINUTES = {1, 5, 15, 60};

    private final GroupSessionGenerationQueueRepository queueRepository;
    private final GroupSessionRecurrenceRepository recurrenceRepository;
    private final GroupSessionSettingsRepository settingsRepository;
    private final SessionRepository sessionRepository;
    private final SessionOutboxEventRepository outboxRepository;
    private final SessionOutboxWriter outboxWriter;
    private final GroupService groupService;
    private final LocationService locationService;
    private final PostService postService;
    private final UserService userService;
    private final GroupSessionRecipients recipients;

    /** Replaceable in tests (the pattern of {@code SessionServiceImpl}); not a constructor dependency. */
    Clock clock = Clock.systemUTC();

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void generate(Long itemId) {
        GroupSessionGenerationItem item = queueRepository.findById(itemId).orElse(null);
        if (item == null || item.getStatus() != GroupSessionGenerationItem.Status.PENDING) {
            return;
        }
        Instant now = clock.instant();

        GroupSessionRecurrence recurrence = recurrenceRepository.findById(item.getRecurrenceId()).orElse(null);
        if (recurrence == null || recurrence.isDraft() || recurrence.getLocationId() == null
                || recurrence.getDurationMinutes() == null) {
            ignore(item, GroupSessionGenerationItem.IgnoredReason.RECURRENCE_INACTIVE, "the recurrence is gone or incomplete");
            return;
        }
        Long groupId = recurrence.getGroupId();
        GroupSessionSettings settings = settingsRepository.findById(groupId).orElse(null);
        if (settings == null || !settings.isEnabled() || settings.getMode() != recurrence.getMode()) {
            ignore(item, GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF, "generation is off or the recurrence is of the other mode");
            return;
        }
        if (!groupService.isGroupActive(groupId)) {
            ignore(item, GroupSessionGenerationItem.IgnoredReason.GROUP_INACTIVE, "the group is no longer active");
            return;
        }

        // The last guard (owner, 2026-11-19): the slot is rebuilt from the recurrence as it is now, so a queued date that no longer
        // falls on its day rule (the owner moved the weekday or the month day while this slot was still queued) is stale.
        if (!GroupSessionOccurrences.fallsOnRule(recurrence, item.getOccurrenceDate())) {
            ignore(item, GroupSessionGenerationItem.IgnoredReason.SUPERSEDED, "the date no longer falls on the recurrence's day");
            return;
        }

        LocationResponse location = locationService.getLocation(recurrence.getLocationId());
        ZoneId zone = location.getTimezone() != null ? ZoneId.of(location.getTimezone()) : ZoneId.systemDefault();
        GroupSessionOccurrences.Occurrence occurrence = GroupSessionOccurrences.at(recurrence, zone, item.getOccurrenceDate());
        if (!occurrence.end().isAfter(now)) {
            ignore(item, GroupSessionGenerationItem.IgnoredReason.OUTDATED, "the slot has already ended");
            return;
        }
        if (sessionRepository.existsByRecurrenceIdAndOccurrenceDate(recurrence.getId(), item.getOccurrenceDate())) {
            done(item, "the session already exists");
            return;
        }

        // The session is the current owner's, like the old generator's and a B9 welcome post. Resolved here, so a group with no
        // owner row fails this attempt (and is retried) rather than being skipped for good.
        UUID ownerId = groupService.getGroupOwnerId(groupId);
        GroupResponse group = groupService.getGroup(groupId, ownerId);
        String title = SessionGenerationService.generatedTitle(group.getGroupName(),
                userService.findPreferredLanguageCodes(Set.of(ownerId)).get(ownerId));
        // SESSION-10/A17: every session needs its companion SESSION_POST, created first in the same transaction.
        Long postId = postService.createSessionPost(ownerId, "Session: " + title);

        // The audience is snapshotted onto the session (a later edit of the recurrence must not change who is told of a cancel).
        List<UUID> chosenMembers = recurrence.getAudience() == GroupAudience.SPECIFIC && recurrence.getAudienceUserIds() != null
                ? List.copyOf(recurrence.getAudienceUserIds()) : null;
        Session session = Session.builder()
                .groupId(groupId)
                .isPublic(false)
                .postId(postId)
                .sessionType(SessionType.GROUP_RECURRING)
                .createdBy(ownerId)
                .sportId(group.getSportId())
                .title(title)
                .locationId(recurrence.getLocationId())
                .locationNote(recurrence.getLocationNote())
                .scheduledStart(occurrence.start())
                .scheduledEndAt(occurrence.end())
                .status(occurrence.start().isAfter(now) ? SessionStatus.SCHEDULED : SessionStatus.ONGOING)
                .feeType(recurrence.getFeeType())
                .feeAmountVnd(recurrence.getFeeAmountVnd())
                .feeNote(recurrence.getFeeNote())
                .autoApprove(true)
                .gameMood(recurrence.getGameMood())
                .attributes(recurrence.getAttributes())
                .groupAudience(recurrence.getAudience())
                .groupAudienceUserIds(chosenMembers)
                .recurrenceId(recurrence.getId())
                .occurrenceDate(item.getOccurrenceDate())
                .build();
        Session saved = sessionRepository.save(session);

        List<UUID> toTell = recipients.of(saved, ownerId, false);
        if (!toTell.isEmpty()) {
            outboxRepository.saveAll(toTell.stream()
                    .map(recipientId -> outboxWriter.build("session.group.created", SessionGroupCreatedEvent.builder()
                            .sessionId(saved.getId())
                            .actorId(ownerId)
                            .recipientUserId(recipientId)
                            .groupId(groupId)
                            .build()))
                    .toList());
        }
        item.setStatus(GroupSessionGenerationItem.Status.DONE);
        item.setLastError(null);
        queueRepository.save(item);
        log.info("Generated session {} for group {} (recurrence {}, {}, {})", saved.getId(), groupId, recurrence.getId(),
                item.getOccurrenceDate(), saved.getStatus());
    }

    /** Counts a failed attempt: back off 1, 5, 15, 60 minutes, then {@code FAILED} on the fifth. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long itemId, String error) {
        GroupSessionGenerationItem item = queueRepository.findById(itemId).orElse(null);
        if (item == null || item.getStatus() != GroupSessionGenerationItem.Status.PENDING) {
            return;
        }
        int attempts = item.getAttempts() + 1;
        item.setAttempts(attempts);
        item.setLastAttemptAt(clock.instant());
        item.setLastError(error == null ? null : error.substring(0, Math.min(error.length(), 500)));
        if (attempts >= GroupSessionGenerationItem.MAX_ATTEMPTS) {
            item.setStatus(GroupSessionGenerationItem.Status.FAILED);
        } else {
            item.setNextAttemptAt(clock.instant().plus(Duration.ofMinutes(BACKOFF_MINUTES[attempts - 1])));
        }
        queueRepository.save(item);
        log.warn("Generating recurrence {} for {} failed (attempt {}): {}", item.getRecurrenceId(), item.getOccurrenceDate(),
                attempts, error);
    }

    /** The slot is covered (its session already exists): nothing to make. */
    private void done(GroupSessionGenerationItem item, String why) {
        item.setStatus(GroupSessionGenerationItem.Status.DONE);
        queueRepository.save(item);
        log.debug("Queue item {} skipped: {}", item.getId(), why);
    }

    /** The slot is skipped, with the reason kept on the row; the planner revives it if the slot is wanted again. */
    private void ignore(GroupSessionGenerationItem item, GroupSessionGenerationItem.IgnoredReason reason, String why) {
        item.setStatus(GroupSessionGenerationItem.Status.IGNORED);
        item.setIgnoredReason(reason);
        queueRepository.save(item);
        log.debug("Queue item {} ignored ({}): {}", item.getId(), reason, why);
    }
}
