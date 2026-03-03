package com.sportconnect.sport.api.dto;

import jakarta.validation.constraints.Min;
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
public class CreateUserSportProfileRequest {

    @NotNull(message = "Sport ID is required")
    private Long sportId;

    @NotNull(message = "Skill level is required")
    @Size(max = 50, message = "Skill level must not exceed 50 characters")
    private String skillLevel;

    @Min(value = 0, message = "Years of experience cannot be negative")
    private Integer yearsOfExperience;

    @Size(max = 100, message = "Preferred position must not exceed 100 characters")
    private String preferredPosition;

    @Size(max = 500, message = "Bio must not exceed 500 characters")
    private String bio;
}
