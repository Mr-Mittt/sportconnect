package com.sportconnect.reference.api.dto;

/**
 * The signal that produced the country of a {@link ResolvedGeoResponse}, in priority order:
 * coordinates, then timezone, then the region subtag of a browser locale.
 */
public enum GeoSource {
    COORDINATES,
    TIMEZONE,
    LOCALE
}
