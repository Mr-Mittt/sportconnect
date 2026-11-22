package com.sportconnect.session.importer;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-70 — writes one finished session with its participants and game records in its own transaction, so a failure in
 * one session never undoes the others (a separate bean: a self-call would not open the transaction).
 *
 * <p>It builds the rows itself instead of calling {@code createSession} and the record service: those refuse a past start,
 * a record older than 24 hours, and they notify and comment, which an import must not do.
 */
@Component
@RequiredArgsConstructor
public class SessionImportWriter {

    private final SessionRepository sessionRepository;
    private final SessionParticipantRepository participantRepository;
    private final SessionRecordRepository recordRepository;
    private final PostService postService;

    /** One session to write: its times, and each game as the winners' and losers' user ids. */
    public record Item(String title, Instant start, Instant end, List<Game> games) {
    }

    public record Game(List<UUID> winners, List<UUID> losers) {
    }

    /**
     * Creates the session {@code COMPLETED}, the companion post first (so the thread works), then every player and the host as
     * {@code JOINED}, then one record per game in order. Returns the new session's id.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long write(Item item, Long groupId, Long sportId, Long locationId, UUID hostId) {
        Long postId = postService.createSessionPost(hostId, "Session: " + item.title());
        Session session = sessionRepository.save(Session.builder()
                .groupId(groupId)
                .isPublic(false)
                .postId(postId)
                .sessionType(SessionType.GROUP_RECURRING)
                .createdBy(hostId)
                .sportId(sportId)
                .title(item.title())
                .locationId(locationId)
                .scheduledStart(item.start())
                .scheduledEndAt(item.end())
                .status(SessionStatus.COMPLETED)
                .feeType(FeeType.FREE)
                .autoApprove(true)
                .groupAudience(GroupAudience.ALL_MEMBERS)
                .initialSlot(0)
                .gameMood(5)
                .build());

        Set<UUID> players = new LinkedHashSet<>();
        players.add(hostId);
        for (Game game : item.games()) {
            players.addAll(game.winners());
            players.addAll(game.losers());
        }
        List<SessionParticipant> participants = new ArrayList<>();
        for (UUID player : players) {
            participants.add(SessionParticipant.builder()
                    .sessionId(session.getId())
                    .userId(player)
                    .status(ParticipantStatus.JOINED)
                    .build());
        }
        participantRepository.saveAll(participants);

        Instant now = Instant.now();
        List<SessionRecord> records = new ArrayList<>();
        for (int i = 0; i < item.games().size(); i++) {
            Game game = item.games().get(i);
            Map<String, Object> data = new LinkedHashMap<>();
            // The sport's own shape (see the Badminton result schema): two sides, the winner first, no score.
            data.put("teams", List.of(side(game.winners()), side(game.losers())));
            records.add(SessionRecord.builder()
                    .sessionId(session.getId())
                    .data(data)
                    .clientRequestId(UUID.nameUUIDFromBytes(("import:" + session.getId() + ":" + i).getBytes(StandardCharsets.UTF_8)))
                    .createdBy(hostId)
                    .createdAt(now)
                    .updatedBy(hostId)
                    .updatedAt(now)
                    .build());
        }
        recordRepository.saveAll(records);
        return session.getId();
    }

    private static Map<String, Object> side(List<UUID> players) {
        Map<String, Object> side = new LinkedHashMap<>();
        side.put("scores", java.util.Collections.singletonList(null));
        side.put("players", players.stream().map(UUID::toString).toList());
        return side;
    }
}
