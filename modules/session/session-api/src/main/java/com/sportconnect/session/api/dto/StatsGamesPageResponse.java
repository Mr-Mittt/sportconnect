package com.sportconnect.session.api.dto;

import java.util.List;

/**
 * SESSION-73: a page of a player's games, newest first. {@code nextCursor} is the record id to send as {@code cursor} for
 * the next page, {@code null} on the last page.
 */
public record StatsGamesPageResponse(List<StatsGameDto> games, Long nextCursor) {
}
