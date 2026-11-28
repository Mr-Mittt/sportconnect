package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/** SESSION-55: a group season. Dates are local dates in {@link #timezone}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeasonResponse {

    private Long id;
    private Long groupId;
    private Long sportId;
    private String name;
    private LocalDate startDate;
    private LocalDate endDate;
    /** IANA id, a snapshot of the group's timezone when the season was created. */
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
