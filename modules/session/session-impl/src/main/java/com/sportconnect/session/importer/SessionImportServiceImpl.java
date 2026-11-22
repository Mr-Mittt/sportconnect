package com.sportconnect.session.importer;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.api.dto.ImportApplyResponse;
import com.sportconnect.session.api.dto.ImportPreviewResponse;
import com.sportconnect.session.api.dto.ImportSessionsRequest;
import com.sportconnect.session.api.service.SessionImportService;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-70 — see {@link SessionImportService}. Both calls first build one {@code Plan} (the checks of the request, the
 * match of every name); the preview reports it, the apply writes it through {@link SessionImportWriter}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionImportServiceImpl implements SessionImportService {

    /** Most sessions in one call (a year of sessions is far fewer; the cap keeps a call bounded). */
    static final int MAX_SESSIONS = 100;
    static final int DEFAULT_MAX_GAMES = 100;
    static final int CEILING_MAX_GAMES = 500;
    static final int DEFAULT_MAX_PER_SIDE = 2;

    private final GroupService groupService;
    private final UserService userService;
    private final LocationService locationService;
    private final SportService sportService;
    private final SessionRepository sessionRepository;
    private final SessionImportWriter writer;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    /** The request after its checks: who the sessions belong to, and each session with its names resolved. */
    private record Plan(Long groupId, Long sportId, Long locationId, UUID hostId,
                        List<PlannedSession> sessions, Map<String, List<ImportPreviewResponse.Candidate>> unresolved,
                        List<ImportPreviewResponse.Candidate> members) {
    }

    /** One session; {@code games.get(i)} holds the winners at 0 and the losers at 1. */
    private record PlannedSession(String title, LocalDate localDate, Instant start, Instant end,
                                  List<List<List<ImportPreviewResponse.PreviewPlayer>>> games) {
    }

    /** {@inheritDoc} */
    @Override
    @Transactional(readOnly = true)
    public ImportPreviewResponse preview(UUID callerId, ImportSessionsRequest request) {
        Plan plan = plan(request);
        Set<String> existing = existingKeys(plan);
        List<ImportPreviewResponse.PreviewSession> sessions = new ArrayList<>();
        for (PlannedSession s : plan.sessions()) {
            List<ImportPreviewResponse.PreviewGame> games = new ArrayList<>();
            for (List<List<ImportPreviewResponse.PreviewPlayer>> game : s.games()) {
                games.add(ImportPreviewResponse.PreviewGame.builder().winners(game.get(0)).losers(game.get(1)).build());
            }
            sessions.add(ImportPreviewResponse.PreviewSession.builder()
                    .title(s.title()).localDate(s.localDate()).scheduledStart(s.start()).scheduledEndAt(s.end())
                    .exists(existing.contains(key(s)))
                    .games(games).build());
        }
        List<ImportPreviewResponse.UnresolvedName> unresolved = new ArrayList<>();
        plan.unresolved().forEach((name, candidates) -> unresolved.add(
                ImportPreviewResponse.UnresolvedName.builder().name(name).candidates(candidates).build()));
        log.info("Session import preview by {}: group {}, {} sessions, {} unresolved names",
                callerId, plan.groupId(), sessions.size(), unresolved.size());
        return ImportPreviewResponse.builder()
                .hostUserId(plan.hostId()).sessions(sessions).unresolved(unresolved).canApply(unresolved.isEmpty())
                .members(plan.members()).build();
    }

    /**
     * {@inheritDoc}
     *
     * <p>Not transactional itself: the plan is read-only, and every session is written by {@link SessionImportWriter} in its
     * own transaction.
     */
    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ImportApplyResponse apply(UUID callerId, ImportSessionsRequest request) {
        Plan plan = plan(request);
        if (!plan.unresolved().isEmpty()) {
            throw new ConflictException("SESSION_IMPORT_UNRESOLVED_NAMES",
                    "Some names do not match exactly one member of the group",
                    Map.of("names", new ArrayList<>(plan.unresolved().keySet())));
        }
        Set<String> existing = existingKeys(plan);
        List<ImportApplyResponse.ImportSessionResult> results = new ArrayList<>();
        int created = 0;
        int skipped = 0;
        int failed = 0;
        for (PlannedSession s : plan.sessions()) {
            ImportApplyResponse.ImportSessionResult.ImportSessionResultBuilder result =
                    ImportApplyResponse.ImportSessionResult.builder().title(s.title()).localDate(s.localDate());
            if (existing.contains(key(s))) {
                results.add(result.status(ImportApplyResponse.Status.SKIPPED).build());
                skipped++;
                continue;
            }
            try {
                List<SessionImportWriter.Game> games = new ArrayList<>();
                for (List<List<ImportPreviewResponse.PreviewPlayer>> game : s.games()) {
                    games.add(new SessionImportWriter.Game(ids(game.get(0)), ids(game.get(1))));
                }
                Long id = writer.write(new SessionImportWriter.Item(s.title(), s.start(), s.end(), games),
                        plan.groupId(), plan.sportId(), plan.locationId(), plan.hostId());
                results.add(result.status(ImportApplyResponse.Status.CREATED).sessionId(id).build());
                // A second session of the same batch with this title and start is a repeat, not another session.
                existing.add(key(s));
                created++;
            } catch (RuntimeException e) {
                log.error("Session import: '{}' on {} failed", s.title(), s.localDate(), e);
                results.add(result.status(ImportApplyResponse.Status.FAILED).build());
                failed++;
            }
        }
        log.info("Session import by {}: group {}, {} created, {} skipped, {} failed", callerId, plan.groupId(), created, skipped, failed);
        return ImportApplyResponse.builder().created(created).skipped(skipped).failed(failed).results(results).build();
    }

    /** The group's sessions that start at any of the batch's instants, as {@code start|title} keys: one query for the whole batch. */
    private Set<String> existingKeys(Plan plan) {
        Set<Instant> starts = new HashSet<>();
        plan.sessions().forEach(s -> starts.add(s.start()));
        Set<String> keys = new HashSet<>();
        sessionRepository.findByGroupIdAndScheduledStartIn(plan.groupId(), starts)
                .forEach(e -> keys.add(e.getScheduledStart() + "|" + e.getTitle()));
        return keys;
    }

    private static String key(PlannedSession s) {
        return s.start() + "|" + s.title();
    }

    private static List<UUID> ids(List<ImportPreviewResponse.PreviewPlayer> players) {
        return players.stream().map(ImportPreviewResponse.PreviewPlayer::getUserId).toList();
    }

    // ---- the plan -------------------------------------------------------------------------------------------------

    private Plan plan(ImportSessionsRequest request) {
        if (request == null || request.getGroupId() == null || request.getLocationId() == null) {
            throw invalid("REQUEST_INCOMPLETE", Map.of());
        }
        if (request.getSessions() == null || request.getSessions().isEmpty() || request.getSessions().size() > MAX_SESSIONS) {
            throw invalid("SESSION_COUNT", Map.of("max", MAX_SESSIONS));
        }
        Long groupId = request.getGroupId();
        if (!groupService.isGroupActive(groupId)) {
            throw ResourceNotFoundException.coded("GROUP_NOT_FOUND", "Group not found", null);
        }
        UUID ownerId = groupService.getGroupOwnerId(groupId);
        // The owner always sees their own group, so the private-group gate of getGroup never refuses this lookup.
        GroupResponse group = groupService.getGroup(groupId, ownerId);
        Long sportId = group.getSportId();
        if (sportId == null) {
            throw new BadRequestException("SESSION_SPORT_REQUIRED", "sportId is required: this group has no sport", null);
        }
        LocationResponse location = locationService.getLocation(request.getLocationId());
        if (!Objects.equals(location.getSportId(), sportId)) {
            throw new BadRequestException("SESSION_LOCATION_SPORT_MISMATCH", "locationId does not match this session's sport", null);
        }
        ZoneId zone;
        try {
            zone = ZoneId.of(location.getTimezone());
        } catch (DateTimeException | NullPointerException e) {
            throw invalid("LOCATION_TIMEZONE", Map.of());
        }

        // Active members only: a deactivated member is never a participant (root CLAUDE.md, Account lifecycle).
        Set<UUID> active = userService.getActiveUserIds(groupService.getMemberUserIds(groupId));
        UUID hostId = request.getHostUserId() != null ? request.getHostUserId() : ownerId;
        if (!active.contains(hostId)) {
            throw new BadRequestException("SESSION_IMPORT_HOST_NOT_MEMBER", "The host is not an active member of the group", null);
        }
        Map<UUID, UserResponse> users = userService.getUsersByIds(new ArrayList<>(active));
        Map<String, List<ImportPreviewResponse.Candidate>> byFirstName = new HashMap<>();
        List<ImportPreviewResponse.Candidate> members = new ArrayList<>();
        for (UUID id : active) {
            UserResponse user = users.get(id);
            if (user != null) {
                ImportPreviewResponse.Candidate candidate = ImportPreviewResponse.Candidate.builder().userId(id).fullName(fullName(user)).build();
                byFirstName.computeIfAbsent(ImportNames.normalize(user.getFirstName()), k -> new ArrayList<>()).add(candidate);
                members.add(candidate);
            }
        }
        members.sort(java.util.Comparator.comparing((ImportPreviewResponse.Candidate c) -> ImportNames.normalize(c.getFullName()))
                .thenComparing(c -> c.getUserId().toString()));
        Map<String, UUID> aliases = new HashMap<>();
        if (request.getAliases() != null) {
            request.getAliases().forEach((name, id) -> {
                if (id == null || !active.contains(id)) {
                    throw new BadRequestException("SESSION_IMPORT_ALIAS_NOT_MEMBER",
                            "The member chosen for '" + name + "' is not an active member of the group", Map.of("name", name));
                }
                aliases.put(ImportNames.normalize(name), id);
            });
        }

        Map<String, Object> schema = sportService.getResultSchema(sportId);
        int maxGames = clamped(schema == null ? null : schema.get("maxRecords"), DEFAULT_MAX_GAMES, CEILING_MAX_GAMES);
        int maxPerSide = maxPerSide(schema);

        Instant now = clock.instant();
        Map<String, List<ImportPreviewResponse.Candidate>> unresolved = new LinkedHashMap<>();
        List<PlannedSession> sessions = new ArrayList<>();
        for (ImportSessionsRequest.ImportedSession s : request.getSessions()) {
            sessions.add(plannedSession(s, zone, now, maxGames, maxPerSide, byFirstName, aliases, users, unresolved));
        }
        return new Plan(groupId, sportId, location.getId(), hostId, sessions, unresolved, members);
    }

    private PlannedSession plannedSession(ImportSessionsRequest.ImportedSession s, ZoneId zone, Instant now,
                                          int maxGames, int maxPerSide,
                                          Map<String, List<ImportPreviewResponse.Candidate>> byFirstName,
                                          Map<String, UUID> aliases, Map<UUID, UserResponse> users,
                                          Map<String, List<ImportPreviewResponse.Candidate>> unresolved) {
        String title = s == null || s.getTitle() == null ? "" : s.getTitle().trim();
        if (s == null || title.isEmpty() || s.getLocalDate() == null || s.getStartTime() == null || s.getEndTime() == null) {
            throw invalid("SESSION_INCOMPLETE", Map.of("title", title));
        }
        if (!s.getEndTime().isAfter(s.getStartTime())) {
            throw invalid("END_NOT_AFTER_START", Map.of("title", title));
        }
        Instant start = s.getLocalDate().atTime(s.getStartTime()).atZone(zone).toInstant();
        Instant end = s.getLocalDate().atTime(s.getEndTime()).atZone(zone).toInstant();
        if (!end.isBefore(now)) {
            throw new BadRequestException("SESSION_IMPORT_NOT_FINISHED", "Only a session that has already ended can be imported",
                    Map.of("title", title));
        }
        if (s.getGames() == null || s.getGames().isEmpty() || s.getGames().size() > maxGames) {
            throw invalid("GAME_COUNT", Map.of("title", title, "max", maxGames));
        }
        List<List<List<ImportPreviewResponse.PreviewPlayer>>> games = new ArrayList<>();
        int number = 0;
        for (ImportSessionsRequest.ImportedGame game : s.getGames()) {
            number++;
            List<ImportPreviewResponse.PreviewPlayer> winners = side(game == null ? null : game.getWinners(), maxPerSide,
                    byFirstName, aliases, users, unresolved, title, number);
            List<ImportPreviewResponse.PreviewPlayer> losers = side(game == null ? null : game.getLosers(), maxPerSide,
                    byFirstName, aliases, users, unresolved, title, number);
            Set<UUID> seen = new HashSet<>();
            List<ImportPreviewResponse.PreviewPlayer> both = new ArrayList<>(winners);
            both.addAll(losers);
            for (ImportPreviewResponse.PreviewPlayer p : both) {
                if (p.getUserId() != null && !seen.add(p.getUserId())) {
                    throw invalid("DUPLICATE_PLAYER", Map.of("title", title, "game", number));
                }
            }
            games.add(List.of(winners, losers));
        }
        return new PlannedSession(title, s.getLocalDate(), start, end, games);
    }

    private List<ImportPreviewResponse.PreviewPlayer> side(List<String> names, int maxPerSide,
                                                           Map<String, List<ImportPreviewResponse.Candidate>> byFirstName,
                                                           Map<String, UUID> aliases, Map<UUID, UserResponse> users,
                                                           Map<String, List<ImportPreviewResponse.Candidate>> unresolved,
                                                           String title, int game) {
        if (names == null || names.isEmpty() || names.size() > maxPerSide) {
            throw invalid("SIDE_SIZE", Map.of("title", title, "game", game, "max", maxPerSide));
        }
        List<ImportPreviewResponse.PreviewPlayer> side = new ArrayList<>();
        for (String raw : names) {
            String name = raw == null ? "" : raw.trim();
            if (name.isEmpty()) {
                throw invalid("NAME_BLANK", Map.of("title", title, "game", game));
            }
            String key = ImportNames.normalize(name);
            UUID aliased = aliases.get(key);
            if (aliased != null) {
                side.add(ImportPreviewResponse.PreviewPlayer.builder().name(name).userId(aliased).fullName(fullName(users.get(aliased))).build());
                continue;
            }
            List<ImportPreviewResponse.Candidate> matches = byFirstName.getOrDefault(key, List.of());
            if (matches.size() == 1) {
                side.add(ImportPreviewResponse.PreviewPlayer.builder().name(name).userId(matches.get(0).getUserId())
                        .fullName(matches.get(0).getFullName()).build());
            } else {
                // No match or several: reported once per distinct name, with the candidates to pick from.
                unresolved.putIfAbsent(name, matches);
                side.add(ImportPreviewResponse.PreviewPlayer.builder().name(name).build());
            }
        }
        return side;
    }

    private static String fullName(UserResponse user) {
        if (user == null) {
            return null;
        }
        String last = user.getLastName() == null ? "" : user.getLastName().trim();
        return (user.getFirstName() == null ? "" : user.getFirstName().trim()) + (last.isEmpty() ? "" : " " + last);
    }

    /** The sport's {@code maxRecords}: default 100 if absent, clamped to 500 (the record service's rule). */
    private static int clamped(Object value, int defaultValue, int ceiling) {
        if (!(value instanceof Number number) || number.intValue() < 1) {
            return defaultValue;
        }
        return Math.min(number.intValue(), ceiling);
    }

    /** {@code record.data.playersPerSide.max} of the result schema, 2 when it does not say. */
    @SuppressWarnings("unchecked")
    private static int maxPerSide(Map<String, Object> schema) {
        try {
            Map<String, Object> record = (Map<String, Object>) schema.get("record");
            Map<String, Object> data = (Map<String, Object>) record.get("data");
            Map<String, Object> per = (Map<String, Object>) data.get("playersPerSide");
            return per.get("max") instanceof Number n && n.intValue() >= 1 ? n.intValue() : DEFAULT_MAX_PER_SIDE;
        } catch (ClassCastException | NullPointerException e) {
            return DEFAULT_MAX_PER_SIDE;
        }
    }

    private static BadRequestException invalid(String reason, Map<String, Object> more) {
        Map<String, Object> params = new LinkedHashMap<>(more);
        params.put("reason", reason);
        return new BadRequestException("SESSION_IMPORT_INVALID", "The import request is not valid: " + reason, params);
    }
}
