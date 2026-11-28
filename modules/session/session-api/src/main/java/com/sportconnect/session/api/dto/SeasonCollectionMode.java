package com.sportconnect.session.api.dto;

/**
 * SESSION-55: how a season gets its sessions. {@code AUTO}: every session of the group whose local date (in the season's timezone)
 * is within the season's dates. {@code MANUAL}: only the sessions an owner or admin linked, and only those whose date is in range.
 * A client-mirrored enum.
 */
public enum SeasonCollectionMode {
    AUTO, MANUAL
}
