package com.sportconnect.session.api.dto;

import java.time.Instant;

/** SESSION-54 slice B: the answer of a group's manual refresh: when the board was built and when the next refresh is allowed. */
public record LeaderboardRefreshResponse(Instant rankedAt, Instant nextRefreshAt) {
}
