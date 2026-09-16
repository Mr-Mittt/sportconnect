package com.sportconnect.location.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocationResponse {

    private Long id;

    private Long sportId;

    private String sportName;

    private String name;

    private String address;

    private Double latitude;

    private Double longitude;

    private String sourceMapsUrl;

    /** LOC-4 — IANA zone id derived from coordinates at creation time; null when the location has
     * no coordinates or when they fall outside every timezone polygon. */
    private String timezone;

    private Long claimedByVendorId;

    private UUID createdBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
