package com.sportconnect.common.attributes.pair;

import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.pair.DerivedSchemaExpander.ExpandedSchema;
import com.sportconnect.common.attributes.pair.DerivedSchemaExpander.RefExpansion;
import com.sportconnect.common.attributes.path.AttributePaths;
import com.sportconnect.common.attributes.resolve.AttributeSchemaResolver;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeGroup;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeNode;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeSchema;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The member-facing view of a {@code (base, derived)} schema pair: the same
 * {@link ResolvedAttributeSchema} shape a single-schema resolution produces (C8), with three extra
 * markers on every node that came from a {@code #ref} — {@code prefillable}, {@code prefillKey} and
 * {@code cardinality} — so a derived-schema form knows which fields to source from the base schema
 * and whether each takes one value or many. Verbatim port of sport
 * {@code SessionAttributeSchemaResolver} (A17), with {@code cardinality} added (extraction plan D9).
 *
 * <p>Two steps: {@link DerivedSchemaExpander} inlines the {@code #ref}s (lenient-dropping stale
 * ones) and yields a plain {@link AttributeSchema} plus a path → {@link RefExpansion} map; C8's
 * {@link AttributeSchemaResolver} locale-resolves that document unchanged; then a walk stamps the
 * markers onto the resolved nodes the map names.
 *
 * <p>{@code prefillKey} now names <em>the base path the client reads the choice list from</em> — no
 * longer a one-shot default. Own nodes and single-schema resolutions carry none of the three
 * markers. Spring-free (D2): a {@code public static} entry point.
 */
public final class DerivedSchemaResolver {

    private DerivedSchemaResolver() {
    }

    /**
     * @param base    the base schema every {@code #ref} resolves against; may be {@code null} (then
     *                every {@code #ref} is dropped)
     * @param derived the stored derived schema; {@code null} yields {@code null}
     * @param locale  the caller's resolved locale
     */
    public static ResolvedAttributeSchema resolve(AttributeSchema base, AttributeSchema derived, Locale locale) {
        if (derived == null) {
            return null;
        }
        ExpandedSchema expanded = DerivedSchemaExpander.expand(base, derived);
        ResolvedAttributeSchema resolved = AttributeSchemaResolver.resolve(expanded.schema(), locale);
        markRefs(resolved.getGroups(), "", expanded.refExpansionsByPath());
        return resolved;
    }

    /**
     * Walks the resolved group tree in parallel with the path keys {@link DerivedSchemaExpander}
     * recorded, stamping {@code prefillable} / {@code prefillKey} / {@code cardinality} onto every
     * node produced from a surviving {@code #ref}.
     */
    private static void markRefs(List<ResolvedAttributeGroup> groups, String parentPath,
                                 Map<String, RefExpansion> refExpansionsByPath) {
        if (groups == null) {
            return;
        }
        for (ResolvedAttributeGroup group : groups) {
            String groupPath = parentPath.isEmpty()
                    ? group.getKey()
                    : parentPath + AttributePaths.SEPARATOR + group.getKey();
            if (group.getAttributes() != null) {
                for (ResolvedAttributeNode attribute : group.getAttributes()) {
                    RefExpansion expansion =
                            refExpansionsByPath.get(groupPath + AttributePaths.SEPARATOR + attribute.getKey());
                    if (expansion != null) {
                        attribute.setPrefillable(true);
                        attribute.setPrefillKey(expansion.basePath());
                        attribute.setCardinality(expansion.cardinality());
                    }
                }
            }
            markRefs(group.getGroups(), groupPath, refExpansionsByPath);
        }
    }
}
