package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-70 — a batch of finished sessions of one group, with their games, to import (preview or apply). Players are
 * named the way the source sheet writes them (first names); the server matches them against the group's members.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSessionsRequest {

    /** The group the sessions belong to (required). The sport is the group's. */
    private Long groupId;

    /** Where every session took place (required); its timezone reads the local date and times. */
    private Long locationId;

    /** The session's creator; defaults to the group's owner. Must be an active member of the group. */
    private UUID hostUserId;

    /** A sheet name (as written in the games) to the member it stands for, chosen by the admin for names the first-name match cannot settle. */
    private Map<String, UUID> aliases;

    private List<ImportedSession> sessions;

    /** One finished session. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportedSession {
        private String title;
        /** The calendar day in the location's timezone. */
        private LocalDate localDate;
        /** Local start and end on that day. */
        private LocalTime startTime;
        private LocalTime endTime;
        /** The games, in the order they were played. */
        private List<ImportedGame> games;
    }

    /** One game: the winning side and the losing side, each one or two names. No score. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportedGame {
        private List<String> winners;
        private List<String> losers;
    }
}
