package com.sportconnect.sport.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateSportRequest {

    @NotBlank(message = "Sport name is required")
    @Size(min = 2, max = 100, message = "Sport name must be between 2 and 100 characters")
    private String name;

    @Size(max = 500, message = "Description must not exceed 500 characters")
    private String description;

    @NotBlank(message = "Category is required")
    @Size(max = 50, message = "Category must not exceed 50 characters")
    private String category;

    @Size(max = 500, message = "Icon URL must not exceed 500 characters")
    private String iconUrl;

    @Min(value = 1, message = "Minimum players must be at least 1")
    private Integer minPlayers;

    @Min(value = 1, message = "Maximum players must be at least 1")
    private Integer maxPlayers;
}
