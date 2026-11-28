package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-55: a group season, the half-open range {@code [startAt, endAt)} of UTC instants (the start of its first day to the start of the
 * day after its last, in the group's timezone when it was saved). {@code startDate}, {@code endDate} and {@code timezone} are for showing it:
 * the dates are read in the group's <b>current</b> timezone (absent when the group's region has none), so after a region change they can read
 * differently while the instants, and so which sessions count, stay fixed.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeasonResponse {

    private Long id;
    private Long groupId;
    private Long sportId;
    private String name;
    private Instant startAt;
    /** Exclusive. */
    private Instant endAt;
    private LocalDate startDate;
    /** The last day of the season (inclusive). */
    private LocalDate endDate;
    /** The group's current IANA timezone the dates are read in; null when the group has none. */
    private String timezone;
    private SeasonStatus status;
    private SeasonCollectionMode collectionMode;
    private boolean inheritRanks;
    /** The season's own stat list ({@code columns}, {@code config}); never null. */
    private Map<String, Object> statsConfig;
    /** The season's own ranking rule per kind ({@code SINGLE}, {@code PARTNER}: {@code sort}, {@code require}); never null, may be empty. */
    private Map<String, Object> rankingRule;
    /** The id of the season's {@code SEASON_POST} anchor; the client uses the season endpoints, never this id directly. */
    private Long postId;
    private UUID createdBy;
    private Instant createdAt;
    private Instant cancelledAt;
    private Instant finalisedAt;
    /** MANUAL seasons: how many sessions are linked; {@code 0} for AUTO. */
    private int linkedSessionCount;
    /** Like state of the season's anchor, filled on the single-season read only (0 / false elsewhere). */
    private Long likeCount;
    private Boolean isLikedByCurrentUser;
}
