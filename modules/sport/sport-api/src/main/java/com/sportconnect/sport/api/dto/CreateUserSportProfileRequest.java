package com.sportconnect.sport.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

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

    /**
     * Sport-specific attributes, validated server-side against the sport's admin-managed schema
     * (A9) — unknown keys and wrong-shaped values are dropped silently, not rejected.
     *
     * <p>On update these <strong>merge</strong> into the stored attributes: a key the request omits
     * keeps its stored value. Two ways a key is removed (A10): the request carries it with an
     * explicit {@code null} (a delete marker — distinct from omitting it), or its definition has
     * been deleted from the schema since it was stored, in which case the next update prunes it.
     */
    private Map<String, Object> attributes;
}
