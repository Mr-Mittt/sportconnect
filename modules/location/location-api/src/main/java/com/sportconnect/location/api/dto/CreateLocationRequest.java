package com.sportconnect.location.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateLocationRequest {

    @NotNull(message = "sportId is required")
    private Long sportId;

    @NotBlank(message = "name is required")
    @Size(max = 200, message = "name must not exceed 200 characters")
    private String name;

    @Size(max = 500, message = "address must not exceed 500 characters")
    private String address;

    private Double latitude;

    private Double longitude;

    @Size(max = 1000, message = "sourceMapsUrl must not exceed 1000 characters")
    private String sourceMapsUrl;
}
