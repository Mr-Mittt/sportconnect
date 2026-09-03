package com.sportconnect.sport.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
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

    /**
     * Required for an ordinary create; optional when {@link #isResume} is {@code true} (a resume
     * carries no profile data — see {@link #isSkillLevelPresentUnlessResume()}). The former
     * {@code @NotNull} was replaced by that conditional check for A20.
     */
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
     *
     * <p>Ignored entirely when {@link #isResume} is {@code true} — a resume reactivates the stored
     * map (pruned to the live schema), it does not merge anything from the request.
     */
    private Map<String, Object> attributes;

    /**
     * A20: when {@code true}, {@code POST /api/sports/profiles} performs a <strong>pure
     * reactivation</strong> of the caller's soft-deleted profile for {@link #sportId} — the stored
     * scalar columns ({@code skillLevel}, {@code bio}, {@code preferredPosition},
     * {@code yearsOfExperience}) are kept verbatim and the stored {@code attributes} map is only
     * pruned to the sport's live schema (A10 {@code retainDefined}). Every other field on this
     * request is ignored.
     *
     * <p>A {@code 400} results if there is no soft-deleted row for {@code (caller, sportId)}, or if
     * that row is currently active (the ordinary active-duplicate guard still applies). Absent /
     * {@code false} → an ordinary create (A7), unchanged.
     */
    private Boolean isResume;

    /**
     * Cross-field rule replacing {@code skillLevel}'s former {@code @NotNull}: skill level is
     * required for an ordinary create but not for a resume, whose body carries no profile data.
     * Named as a getter so Bean Validation treats it as a property constraint; {@code @JsonIgnore}
     * keeps it off the wire.
     */
    @AssertTrue(message = "Skill level is required")
    @JsonIgnore
    public boolean isSkillLevelPresentUnlessResume() {
        return Boolean.TRUE.equals(isResume) || (skillLevel != null && !skillLevel.isBlank());
    }
}
