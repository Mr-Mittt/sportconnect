package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sportconnect.common.attributes.AttributeFieldLayout;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.Cardinality;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A {@code #ref} node — legal only in a <em>derived</em> schema (the single-schema validator, C6,
 * rejects it; the pair validator, C9, requires it). Extraction plan D9:
 *
 * <p>It declares an attribute whose value(s) are <strong>chosen from the base schema</strong> at
 * the {@link #ref} path — the ref is a <em>data source</em> pointer, not a "mirror this attribute"
 * pointer. It inherits {@code type}/{@code options}/{@code definitionRef} from that base attribute
 * at expansion time; here it carries only:
 *
 * <ul>
 *   <li>{@link #key} — <strong>required</strong>, its own sibling-unique key (replacing the old
 *       "last {@code /}-segment of the ref path" rule);</li>
 *   <li>{@link #ref} — the {@code /}-separated base-schema path, serialised as the JSON key
 *       {@code "#ref"}; globally unique across the derived schema;</li>
 *   <li>{@link #cardinality} — <strong>required</strong>, {@code SINGLE} or {@code LIST};</li>
 *   <li>{@link #label} — optional locale→text override of the inherited label.</li>
 * </ul>
 *
 * <p>Its wire type discriminator is the string {@code "REF"}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class RefAttribute implements AttributeNode {

    private String key;

    /** Optional label override; unlike an own node's label it need not cover {@code defaultLocale}. */
    private Map<String, String> label;

    /** The base-schema attribute path this node draws its value(s) from, e.g. {@code gear/shuttlecock}. */
    @JsonProperty("#ref")
    private String ref;

    /** Required. {@code SINGLE} → one value (single-select UI); {@code LIST} → many (multi-select UI). */
    private Cardinality cardinality;

    /** Optional server-opaque presentation hint (C11); carried raw through expansion onto the resolved node. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Absent reads as {@code false}. See {@link AttributeNode#getHidden()}. */
    private Boolean hidden;

    /**
     * Optional per-field presentation overrides for the fields of the definition type this
     * {@code #ref} resolves to, keyed by field key (C11). Legal only on a {@code #ref} node.
     * Server-opaque: carried verbatim onto the resolved node (via the derived-schema expander's
     * {@code RefExpansion} record), never validated against the target definition's fields — an
     * unknown key is tolerated.
     */
    private Map<String, AttributeFieldLayout> fieldLayouts;
}
