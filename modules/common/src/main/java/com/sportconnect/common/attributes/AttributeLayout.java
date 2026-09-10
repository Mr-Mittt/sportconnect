package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * An optional, <strong>server-opaque</strong> presentation hint on an attribute node, definition
 * field or group (C11). The vocabulary is owned entirely by the client
 * ({@code documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md}); the server never resolves or interprets any
 * of these fields — it validates the shape on an admin schema write and otherwise carries the object
 * verbatim through the JSON round-trip, the locale resolver and the {@code #ref} derived-schema
 * expander.
 *
 * <p>An object rather than a bare string so more properties can be added client-side without a model
 * migration — {@link JsonIgnoreProperties}{@code (ignoreUnknown = true)} lets a newer client send a
 * property this version does not know without failing the strict framework parser
 * ({@link com.sportconnect.common.attributes.json.AttributeJson}); such a property is dropped, not
 * carried.
 *
 * <p>Deliberately shared by the raw model and the {@code Resolved*} twins: unlike {@code label},
 * {@code format} stays a raw {@code locale -> pattern} map on <em>both</em> sides — the client
 * resolves it (client ticket {@code SPORT-16}). This is the one place a {@code Resolved*} field is
 * not collapsed to a single locale's value.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class AttributeLayout {

    /**
     * The layout id for this element/type — opaque server-side, one of the client's per-element
     * vocabularies. Required whenever a {@code layout} object is present: the single-schema
     * validator rejects a {@code layout} with a null or blank {@code id} (shape sanity only — an
     * <em>unknown</em> id is accepted, the client degrades to its default).
     */
    private String id;

    /** Optional Tabler (outline) icon name. Opaque server-side. */
    private String icon;

    /**
     * Optional value-format pattern, carried as a raw {@code locale -> pattern} map exactly like a
     * {@code label} map — <strong>not</strong> resolved to a single string server-side (client
     * ticket {@code SPORT-16} does that). {@code null} when the element declares no format.
     */
    private Map<String, String> format;
}
