package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * One entry of a {@code #ref} node's {@code fieldLayouts} map (C11) — a per-field presentation
 * override for the fields of the definition type the {@code #ref} points at, keyed by field key.
 * Server-opaque: validated for shape only on an admin write, carried verbatim otherwise.
 *
 * <p>A <strong>partial</strong> {@link AttributeLayout} (every property optional, {@code id}
 * included) <em>plus</em> an optional {@code hidden} flag. The client applies it as a whole-object
 * <em>replace</em> of the referenced definition field's own {@code layout}
 * ({@code fieldLayouts[key] ?? definitionField.layout}), never a deep merge, and it never overrides
 * a field's {@code type} / {@code options} / {@code isRequired} / {@code definitionRef}. An unknown
 * map key (no such field on the definition) is tolerated.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class AttributeFieldLayout {

    /** Optional layout id override. Opaque server-side; unlike {@link AttributeLayout#getId()} it may be absent. */
    private String id;

    /** Optional Tabler (outline) icon name override. */
    private String icon;

    /** Optional raw {@code locale -> pattern} format-map override (not resolved server-side). */
    private Map<String, String> format;

    /**
     * Optional render-suppression override for this one field — {@code true} hides the field's
     * editor input and read-only row while its stored value still round-trips. Absent reads as
     * {@code false}.
     */
    private Boolean hidden;
}
