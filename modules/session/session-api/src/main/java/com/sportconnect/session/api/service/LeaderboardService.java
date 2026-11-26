package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.LeaderboardRefreshResponse;
import com.sportconnect.session.api.dto.LeaderboardResponse;

import java.util.UUID;

/**
 * SESSION-54 slice B: the leaderboards, read back (the ranking job of slice A builds them). Region and country boards are for
 * every signed-in user, a group board for its members; a sport whose statistics switch is off answers as an unknown sport.
 */
public interface LeaderboardService {

    /**
     * A page of a group's board; the sport is the group's. Members only (403 {@code SESSION_GROUP_MEMBER_REQUIRED}).
     *
     * @param kind   {@code SINGLE} (default) or {@code PARTNER}
     * @param cursor the {@code nextCursor} of the previous page, {@code null} for the first
     */
    LeaderboardResponse getGroupBoard(Long groupId, UUID callerId, String kind, Integer cursor, int size);

    LeaderboardResponse getRegionBoard(Long regionId, Long sportId, UUID callerId, String kind, Integer cursor, int size);

    LeaderboardResponse getCountryBoard(Long countryId, Long sportId, UUID callerId, String kind, Integer cursor, int size);

    /**
     * Rebuilds a group's board now (group owner or admin). Allowed when the board was last built at least the cooldown ago;
     * otherwise 429 {@code SESSION_RANKING_COOLDOWN} with {@code retryAfterSeconds}.
     */
    LeaderboardRefreshResponse refreshGroupBoard(Long groupId, UUID callerId);
}
