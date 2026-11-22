package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * SESSION-70 — what an import would do: every session with its games and the members the names matched, and the names the
 * server could not settle. Nothing is written.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportPreviewResponse {

    /** The group's sport and the host that will own the sessions. */
    private UUID hostUserId;

    private List<PreviewSession> sessions;

    /** Names with no match or several, in first-seen order; the apply is refused while any is left. */
    private List<UnresolvedName> unresolved;

    /** True when {@link #unresolved} is empty. */
    private boolean canApply;

    /** One session as it would be created. {@code exists} is true when the same group, title and start are already there. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PreviewSession {
        private String title;
        private LocalDate localDate;
        private Instant scheduledStart;
        private Instant scheduledEndAt;
        private boolean exists;
        private List<PreviewGame> games;
    }

    /** One game with its two sides resolved. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PreviewGame {
        private List<PreviewPlayer> winners;
        private List<PreviewPlayer> losers;
    }

    /** A name as written, and the member it resolved to ({@code null} when unresolved). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PreviewPlayer {
        private String name;
        private UUID userId;
        private String fullName;
    }

    /** A name that matched no member or several, with the candidates to choose from (empty when none matched). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UnresolvedName {
        private String name;
        private List<Candidate> candidates;
    }

    /** An active member of the group. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Candidate {
        private UUID userId;
        private String fullName;
    }
}
