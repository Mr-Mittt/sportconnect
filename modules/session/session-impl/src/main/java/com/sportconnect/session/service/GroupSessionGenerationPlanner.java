package com.sportconnect.session.service;

import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.GroupSessionGenerationItem;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * SESSION-GROUP-5 — decides which slots to put on the generation queue; {@link GroupSessionGenerationRunner} then generates
 * them. Only a group that has generation <b>on</b> is ever planned, and only its <b>complete</b> (non-draft) recurrences of
 * its <b>active mode</b>; so turning generation off, or a cancel while it is off, queues nothing.
 *
 * <p>Called after the change that asked for it has committed ({@link GroupSessionGenerationListener}), so it reads the new state.
 * The methods are {@code NOT_SUPPORTED}: they suspend the caller's finished transaction (whose connection stays bound until the
 * callback returns), every read is its own short transaction with a fresh persistence context, and every write goes through
 * {@link GroupSessionQueueWriter} in its own small transaction, one slot at a time, so a thread holds at most two connections and
 * a conflict on one slot can never roll back the others. Queuing is idempotent and race-free (review, 2026-11-19): a slot already
 * generated is left alone; a new slot is inserted and a unique-key violation (a concurrent planner queued it) is absorbed and
 * logged; a {@code FAILED} or {@code IGNORED} slot is revived by an atomic compare-and-set; a {@code PENDING} slot's order key is
 * refreshed; and the recurrence's other {@code PENDING} slots, being obsolete once this slot is authoritative, are ignored. That is
 * what makes the startup recovery, the "last session of the day" trigger and a configuration change safe to race, on any thread
 * or instance.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupSessionGenerationPlanner {

    private static final List<SessionStatus> OPEN_STATUSES =
            List.of(SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING);
    private static final List<SessionStatus> LIVE_STATUSES = List.of(SessionStatus.SCHEDULED, SessionStatus.ONGOING);

    private final GroupSessionSettingsRepository settingsRepository;
    private final GroupSessionRecurrenceRepository recurrenceRepository;
    private final GroupSessionGenerationQueueRepository queueRepository;
    private final SessionRepository sessionRepository;
    private final LocationService locationService;
    private final GroupSessionQueueWriter writer;

    /** Replaceable in tests; not a constructor dependency. */
    Clock clock = Clock.systemUTC();

    /** A complete recurrence of an active mode, with the zone it is read in and its next slot. */
    private record Candidate(GroupSessionRecurrence recurrence, ZoneId zone, GroupSessionOccurrences.Occurrence slot) {
        Long groupId() {
            return recurrence.getGroupId();
        }
    }

    /** Startup recovery: the nearest day of every group that has generation on (the server may have been down across a slot). */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int enqueueForAllEnabledGroups() {
        List<Long> groupIds = settingsRepository.findByEnabledTrue().stream().map(GroupSessionSettings::getGroupId).toList();
        return groupIds.isEmpty() ? 0 : enqueueNearestDays(groupIds);
    }

    /**
     * The last regular session of a day has ended (completed or cancelled): for each such group, queue its next nearest day.
     * A day is over only when the group holds no open regular session for that local date any more; custom sessions never
     * count and never trigger.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int enqueueAfterDaysEnded(List<GroupSessionGenerationEvents.GroupDay> endedDays) {
        List<Long> groupIds = endedDays.stream().map(GroupSessionGenerationEvents.GroupDay::groupId).distinct().toList();
        if (groupIds.isEmpty()) {
            return 0;
        }
        Set<GroupSessionGenerationEvents.GroupDay> stillOpen = sessionRepository.findOpenRegularDays(groupIds, OPEN_STATUSES).stream()
                .map(row -> new GroupSessionGenerationEvents.GroupDay((Long) row[0], (LocalDate) row[1]))
                .collect(Collectors.toSet());
        List<Long> over = endedDays.stream()
                .filter(day -> !stillOpen.contains(day))
                .map(GroupSessionGenerationEvents.GroupDay::groupId)
                .distinct()
                .toList();
        return over.isEmpty() ? 0 : enqueueNearestDays(over);
    }

    /**
     * An owner or admin switched generation on, switched the mode, or added or edited a configuration: queue today's slots that
     * have not ended yet (they are generated now, with the right status), then the nearest later day unless a regular session
     * is already open before it (that session's end will queue it, and so will today's).
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public int enqueueAfterConfigurationChange(Long groupId) {
        Instant now = clock.instant();
        List<Candidate> candidates = candidates(List.of(groupId), now).getOrDefault(groupId, List.of());
        if (candidates.isEmpty()) {
            return 0;
        }
        List<Candidate> today = candidates.stream().filter(c -> c.slot().date().equals(LocalDate.ofInstant(now, c.zone()))).toList();
        List<Candidate> later = candidates.stream().filter(c -> c.slot().date().isAfter(LocalDate.ofInstant(now, c.zone()))).toList();
        List<Candidate> toQueue = new ArrayList<>(today);
        if (today.isEmpty() && !later.isEmpty()) {
            List<Candidate> nearest = nearestDay(later);
            Instant nearestStart = nearest.stream().map(c -> c.slot().start()).min(Comparator.naturalOrder()).orElseThrow();
            if (!sessionRepository.existsByGroupIdAndRecurrenceIdIsNotNullAndStatusInAndScheduledStartLessThan(
                    groupId, LIVE_STATUSES, nearestStart)) {
                toQueue.addAll(nearest);
            }
        }
        return queue(toQueue, now);
    }

    // ---- shared ---------------------------------------------------------------------------------------------------

    private int enqueueNearestDays(Collection<Long> groupIds) {
        Instant now = clock.instant();
        List<Candidate> toQueue = new ArrayList<>();
        candidates(groupIds, now).values().forEach(groupCandidates -> toQueue.addAll(nearestDay(groupCandidates)));
        return queue(toQueue, now);
    }

    /** The candidates of one group that fall on its nearest day (the day of its earliest next slot). */
    private static List<Candidate> nearestDay(List<Candidate> groupCandidates) {
        if (groupCandidates.isEmpty()) {
            return List.of();
        }
        LocalDate nearest = groupCandidates.stream()
                .min(Comparator.comparing(c -> c.slot().start()))
                .orElseThrow().slot().date();
        return groupCandidates.stream().filter(c -> c.slot().date().equals(nearest)).toList();
    }

    /** Per group with generation on: its complete recurrences of the active mode, each with its next slot. Four queries in all. */
    private Map<Long, List<Candidate>> candidates(Collection<Long> groupIds, Instant now) {
        Map<Long, GroupSessionSettings> settingsByGroup = settingsRepository.findByGroupIdInAndEnabledTrue(groupIds).stream()
                .collect(Collectors.toMap(GroupSessionSettings::getGroupId, s -> s));
        if (settingsByGroup.isEmpty()) {
            return Map.of();
        }
        List<GroupSessionRecurrence> recurrences = recurrenceRepository.findByGroupIdInAndDraftFalse(settingsByGroup.keySet()).stream()
                .filter(r -> r.getMode() == settingsByGroup.get(r.getGroupId()).getMode())
                .filter(r -> r.getLocationId() != null && r.getDurationMinutes() != null)
                .toList();
        if (recurrences.isEmpty()) {
            return Map.of();
        }
        Map<Long, LocationResponse> locations = locationService.getLocationsByIds(
                recurrences.stream().map(GroupSessionRecurrence::getLocationId).filter(Objects::nonNull).distinct().toList());
        Map<Long, List<Candidate>> byGroup = new HashMap<>();
        for (GroupSessionRecurrence recurrence : recurrences) {
            LocationResponse location = locations.get(recurrence.getLocationId());
            ZoneId zone = location != null && location.getTimezone() != null ? ZoneId.of(location.getTimezone()) : ZoneId.systemDefault();
            byGroup.computeIfAbsent(recurrence.getGroupId(), id -> new ArrayList<>())
                    .add(new Candidate(recurrence, zone, GroupSessionOccurrences.next(recurrence, zone, now)));
        }
        return byGroup;
    }

    /**
     * Puts the slots on the queue, one at a time: unless already generated, an obsolete {@code PENDING} slot of the same
     * recurrence is ignored, then the slot is inserted, or its {@code PENDING} order key refreshed, or its {@code FAILED} or
     * {@code IGNORED} row revived. Each write is atomic, so a race with another planner changes nothing it should not; a lost race
     * is logged at INFO with the marker {@code queue race absorbed}.
     *
     * @return how many slots were queued or revived
     */
    private int queue(List<Candidate> candidates, Instant now) {
        if (candidates.isEmpty()) {
            return 0;
        }
        List<Long> recurrenceIds = candidates.stream().map(c -> c.recurrence().getId()).distinct().toList();
        LocalDate earliest = candidates.stream().map(c -> c.slot().date()).min(Comparator.naturalOrder()).orElseThrow();
        Map<String, GroupSessionGenerationItem> queued = queueRepository.findByRecurrenceIdIn(recurrenceIds).stream()
                .collect(Collectors.toMap(i -> key(i.getRecurrenceId(), i.getOccurrenceDate()), i -> i));
        Set<String> generated = sessionRepository.findByRecurrenceIdInAndOccurrenceDateGreaterThanEqual(recurrenceIds, earliest).stream()
                .map((Session s) -> key(s.getRecurrenceId(), s.getOccurrenceDate()))
                .collect(Collectors.toSet());

        int changed = 0;
        Set<String> inThisCall = new HashSet<>();
        for (Candidate candidate : candidates) {
            Long recurrenceId = candidate.recurrence().getId();
            LocalDate date = candidate.slot().date();
            Instant start = candidate.slot().start();
            String key = key(recurrenceId, date);
            if (generated.contains(key) || !inThisCall.add(key)) {
                continue;
            }
            GroupSessionGenerationItem existing = queued.get(key);
            if (existing != null && existing.getStatus() == GroupSessionGenerationItem.Status.DONE) {
                continue;
            }
            // This slot is the recurrence's authoritative one: any other PENDING slot of it is obsolete.
            writer.supersedeOthers(recurrenceId, date, now);
            if (existing == null) {
                try {
                    writer.insert(recurrenceId, date, start, now);
                    changed++;
                } catch (DataIntegrityViolationException race) {
                    log.info("queue race absorbed: recurrence {} on {} was queued by a concurrent planner", recurrenceId, date);
                }
            } else if (existing.getStatus() == GroupSessionGenerationItem.Status.PENDING) {
                if (!start.equals(existing.getTargetStart())) {
                    writer.refreshTarget(recurrenceId, date, start, now);
                }
            } else if (writer.revive(recurrenceId, date, start, now) > 0) {   // FAILED or IGNORED
                changed++;
            } else {
                log.info("queue race absorbed: recurrence {} on {} was revived by a concurrent planner", recurrenceId, date);
            }
        }
        if (changed > 0) {
            log.info("Queued {} regular session slot(s) for generation", changed);
        }
        return changed;
    }

    private static String key(Long recurrenceId, LocalDate date) {
        return recurrenceId + "@" + date;
    }
}
