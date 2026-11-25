package com.sportconnect.session.api.dto;

import java.util.UUID;

/** SESSION-73: a player as a statistics screen shows them (the display lookup: a deactivated account keeps its name). */
public record StatsPlayerDto(UUID id, String fullName, String avatarUrl) {
}
