package com.sportconnect.session.api.dto;

import java.time.Instant;
import java.util.List;

/**
 * SESSION-73: one counted game in a player's history.
 *
 * @param title    the session's title, {@code null} when it has none
 * @param playedAt the session's start
 * @param ranking  whether it counted as a ranking game (the mark the statistics engine recorded when it counted it)
 * @param outcome  how it ended for the asking player, {@code WIN} or {@code LOSS}; {@code null} when the record can no
 *                 longer be read through the sport's current schema
 */
public record StatsGameDto(Long recordId, Long sessionId, String title, Instant playedAt, boolean ranking,
                           String outcome, List<StatsGameTeamDto> teams) {
}
