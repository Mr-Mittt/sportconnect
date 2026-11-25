package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.GroupMemberStatisticsResponse;
import com.sportconnect.session.api.dto.GroupStatisticsResponse;
import com.sportconnect.session.api.dto.PlayerStatisticsResponse;
import com.sportconnect.session.api.dto.StatsGamesPageResponse;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

/**
 * SESSION-73: the read side of the statistics the engine of SESSION-53 writes. Read-only: nothing here counts, ranks or
 * changes a row. The columns of every answer come from the sport's result schema ({@code record.scoreboard.columns}); a sport whose statistics switch is off shows none; the jsonb the
 * numbers come from is described in {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 */
public interface SessionStatisticsService {

    /**
     * The caller's own statistics in one sport: totals for all, ranking and normal games, results per pair and per partner,
     * and per region and country of the venues. A player with no counted game gets zeros and a {@code null} {@code asOf}.
     *
     * @param page 0-based page of the pairs or partners; @param size 1 to 50
     * @throws com.sportconnect.common.exception.BadRequestException a page below 0 or a size outside 1 to 50
     * @throws com.sportconnect.common.exception.ResourceNotFoundException {@code SPORT_NOT_FOUND}: the sport is missing or
     *         deactivated
     */
    PlayerStatisticsResponse getMyStatistics(UUID userId, Long sportId, int page, int size);

    /**
     * A page of the caller's counted games in one sport, newest first, read from the history pointers (the latest 500).
     * Games, sessions and names are each resolved in one batch for the page; a pointer whose record is gone is skipped, so a
     * page can hold fewer than {@code size} games.
     *
     * @param cursor the {@code recordId} of the last game of the previous page, or {@code null} for the first page
     * @param size   how many pointers to read, 1 to 50
     * @throws com.sportconnect.common.exception.BadRequestException a size outside 1 to 50
     * @throws com.sportconnect.common.exception.ResourceNotFoundException {@code SPORT_NOT_FOUND}
     */
    StatsGamesPageResponse getMyGames(UUID userId, Long sportId, Long cursor, int size);

    /**
     * A group's member statistics: one row per current, active member with a counted game, totals only, most games first.
     *
     * @throws com.sportconnect.common.exception.ForbiddenException {@code SESSION_GROUP_MEMBER_REQUIRED}: the caller is
     *         not a member (the same answer for a group that does not exist, so its existence is not told)
     * @throws com.sportconnect.common.exception.ResourceNotFoundException {@code SPORT_NOT_FOUND}
     */
    GroupStatisticsResponse getGroupStatistics(Long groupId, UUID callerId, Pageable pageable);

    /**
     * One member's statistics in a group, with their pairs or partners (the sport's one grouping, one page of it). Any member of the group may read it; the member asked about may
     * have left the group or been deactivated and is still shown.
     *
     * @throws com.sportconnect.common.exception.ForbiddenException {@code SESSION_GROUP_MEMBER_REQUIRED}
     * @throws com.sportconnect.common.exception.ResourceNotFoundException {@code SPORT_NOT_FOUND}
     */
    GroupMemberStatisticsResponse getGroupMemberStatistics(Long groupId, UUID callerId, UUID memberId, int page,
                                                          int size);
}
