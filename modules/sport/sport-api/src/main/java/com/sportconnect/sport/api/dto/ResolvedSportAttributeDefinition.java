package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeDefinition}, locale-resolved (A13): {@code label} is a single display
 * string for the caller's locale instead of the raw {@code Map<String, String>}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeDefinition {

    private String key;

    private String label;

    private SportAttributeType type;

    private List<ResolvedSportAttributeOption> options;

    private Boolean isAvailable;

    private Object defaultValue;

    /** Inclusive bounds for a {@code NUMBER} attribute (A16); {@code null} for every other type. */
    private Double min;

    private Double max;

    private String definitionRef;

    private String searchScope;

    /**
     * A17, session schema only: {@code true} when this node was produced from a {@code #ref} in a
     * session attribute schema, i.e. it mirrors a profile attribute and the client may pre-fill it
     * from the session creator's own sport profile. {@code null} on every profile-schema resolution
     * and on session own nodes.
     */
    private Boolean prefillable;

    /**
     * A17, session schema only: when {@link #prefillable} is {@code true}, the full {@code /}-path of
     * the profile attribute this node mirrors ({@code gear/rackets/tension}) — the key the client
     * reads the creator's stored value from. {@code null} otherwise.
     */
    private String prefillKey;
}
