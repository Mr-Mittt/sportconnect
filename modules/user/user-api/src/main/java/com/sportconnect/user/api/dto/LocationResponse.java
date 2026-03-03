package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocationResponse {

    private Double latitude;
    private Double longitude;

    public static LocationResponse of(Double latitude, Double longitude) {
        return LocationResponse.builder()
                .latitude(latitude)
                .longitude(longitude)
                .build();
    }
}
