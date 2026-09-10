package com.sportconnect.common.attributes.resolve;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeOption;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.AttributeType;
import com.sportconnect.common.attributes.field.AttributeField;
import com.sportconnect.common.attributes.field.BooleanField;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.attributes.field.EnumField;
import com.sportconnect.common.attributes.field.ListField;
import com.sportconnect.common.attributes.field.NumberField;
import com.sportconnect.common.attributes.field.StringField;
import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.EnumAttribute;
import com.sportconnect.common.attributes.node.ListAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeDefinitionType;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeField;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeGroup;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeNode;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeOption;
import com.sportconnect.common.attributes.resolved.ResolvedAttributeSchema;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Resolves a raw, multi-locale {@link AttributeSchema} (every {@code label} a
 * {@code Map<String, String>}) into a {@link ResolvedAttributeSchema} (every {@code label} one
 * {@code String}) for one caller's {@link Locale}. Verbatim port of sport
 * {@code SportAttributeSchemaLabelResolver} (A13, v2 design §7.3–§7.4).
 *
 * <p>Resolution order per label: exact language tag → language-only tag → the document's own
 * {@code defaultLocale}. The single-schema validator (C6) guarantees every label carries a
 * {@code defaultLocale} entry, so the last step never misses in practice.
 *
 * <p>The sealed input hierarchy collapses to the <strong>flat</strong> resolved DTOs
 * ({@link ResolvedAttributeNode} / {@link ResolvedAttributeField}) — {@code type} plus the per-kind
 * fields, the rest {@code null} (extraction plan D6). {@code cardinality} / {@code prefillable} /
 * {@code prefillKey} are <strong>not</strong> set here — C9's derived-schema resolver stamps them
 * after {@code #ref} expansion. Spring-free (D2): a {@code public static} entry point.
 *
 * <p>C11 presentation hints ({@code layout} / {@code hidden} on every node, field and group, plus a
 * {@code #ref} node's {@code fieldLayouts}) are copied to the {@code Resolved*} twin
 * <strong>verbatim</strong> — no interpretation, and {@code layout.format} stays a raw
 * {@code locale -> pattern} map here (the client resolves it, ticket {@code SPORT-16}). A
 * {@code #ref}-derived node takes its {@code layout} / {@code hidden} / {@code fieldLayouts} from
 * the {@code #ref} itself, stamped by C9's derived-schema resolver, not from this walk.
 */
public final class AttributeSchemaResolver {

    private AttributeSchemaResolver() {
    }

    /**
     * @param schema the raw, admin-authored document; {@code null} resolves to {@code null}
     * @param locale the caller's resolved locale
     * @return the same tree with every {@code label} collapsed to one string; no {@code defaultLocale}
     */
    public static ResolvedAttributeSchema resolve(AttributeSchema schema, Locale locale) {
        if (schema == null) {
            return null;
        }
        String exact = locale.toLanguageTag();
        String language = locale.getLanguage();
        String defaultLocale = schema.getDefaultLocale();

        return ResolvedAttributeSchema.builder()
                .definitions(nullSafe(schema.getDefinitions()).stream()
                        .map(definition -> resolveDefinitionType(definition, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .groups(nullSafe(schema.getGroups()).stream()
                        .map(group -> resolveGroup(group, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    /** Recurses through nested sub-groups (v3/A19): resolved {@code attributes} and child {@code groups} both. */
    private static ResolvedAttributeGroup resolveGroup(AttributeGroup group,
                                                       String exact, String language, String defaultLocale) {
        return ResolvedAttributeGroup.builder()
                .key(group.getKey())
                .label(resolveLabel(group.getLabel(), exact, language, defaultLocale))
                .layout(group.getLayout())
                .hidden(group.getHidden())
                .isAvailable(group.getIsAvailable())
                .groups(nullSafe(group.getGroups()).stream()
                        .map(child -> resolveGroup(child, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .attributes(nullSafe(group.getAttributes()).stream()
                        .map(node -> resolveNode(node, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    private static ResolvedAttributeNode resolveNode(AttributeNode node,
                                                     String exact, String language, String defaultLocale) {
        ResolvedAttributeNode.ResolvedAttributeNodeBuilder builder = ResolvedAttributeNode.builder()
                .key(node.getKey())
                .label(resolveLabel(node.getLabel(), exact, language, defaultLocale))
                .layout(node.getLayout())
                .hidden(node.getHidden());

        switch (node) {
            case StringAttribute a -> builder.type(AttributeType.STRING)
                    .isAvailable(a.getIsAvailable()).defaultValue(a.getDefaultValue());
            case NumberAttribute a -> builder.type(AttributeType.NUMBER)
                    .isAvailable(a.getIsAvailable()).defaultValue(a.getDefaultValue())
                    .min(a.getMin()).max(a.getMax());
            case BooleanAttribute a -> builder.type(AttributeType.BOOLEAN)
                    .isAvailable(a.getIsAvailable()).defaultValue(a.getDefaultValue());
            case EnumAttribute a -> builder.type(AttributeType.ENUM)
                    .isAvailable(a.getIsAvailable()).defaultValue(a.getDefaultValue())
                    .options(resolveOptions(a.getOptions(), exact, language, defaultLocale));
            case ListAttribute a -> builder.type(AttributeType.LIST)
                    .isAvailable(a.getIsAvailable()).defaultValue(a.getDefaultValue())
                    .options(resolveOptions(a.getOptions(), exact, language, defaultLocale));
            case DefinitionAttribute a -> builder.type(AttributeType.DEFINITION)
                    .isAvailable(a.getIsAvailable()).definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope());
            case DefinitionListAttribute a -> builder.type(AttributeType.DEFINITION_LIST)
                    .isAvailable(a.getIsAvailable()).definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope());
            // A #ref node should never reach a single-schema resolve (C6 rejects it; C9 resolves
            // only expanded, ref-free schemas). Resolve key + label (+ its own fieldLayouts), leave
            // type null — never throw.
            case RefAttribute a -> builder.fieldLayouts(a.getFieldLayouts());
        }
        return builder.build();
    }

    private static ResolvedAttributeDefinitionType resolveDefinitionType(AttributeDefinitionType definition,
                                                                         String exact, String language, String defaultLocale) {
        return ResolvedAttributeDefinitionType.builder()
                .name(definition.getName())
                .fields(nullSafe(definition.getFields()).stream()
                        .map(field -> resolveField(field, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    private static ResolvedAttributeField resolveField(AttributeField field,
                                                       String exact, String language, String defaultLocale) {
        ResolvedAttributeField.ResolvedAttributeFieldBuilder builder = ResolvedAttributeField.builder()
                .key(field.getKey())
                .label(resolveLabel(field.getLabel(), exact, language, defaultLocale))
                .layout(field.getLayout())
                .hidden(field.getHidden())
                .isRequired(field.getIsRequired());

        switch (field) {
            case StringField f -> builder.type(AttributeType.STRING);
            case BooleanField f -> builder.type(AttributeType.BOOLEAN);
            case NumberField f -> builder.type(AttributeType.NUMBER).min(f.getMin()).max(f.getMax());
            case EnumField f -> builder.type(AttributeType.ENUM)
                    .options(resolveOptions(f.getOptions(), exact, language, defaultLocale));
            case ListField f -> builder.type(AttributeType.LIST)
                    .options(resolveOptions(f.getOptions(), exact, language, defaultLocale));
            case DefinitionField f -> builder.type(AttributeType.DEFINITION).definitionRef(f.getDefinitionRef());
        }
        return builder.build();
    }

    private static List<ResolvedAttributeOption> resolveOptions(List<AttributeOption> options,
                                                                String exact, String language, String defaultLocale) {
        return nullSafe(options).stream()
                .map(option -> ResolvedAttributeOption.builder()
                        .value(option.getValue())
                        .label(resolveLabel(option.getLabel(), exact, language, defaultLocale))
                        .build())
                .collect(Collectors.toList());
    }

    private static String resolveLabel(Map<String, String> label, String exact, String language, String defaultLocale) {
        if (label == null) {
            return null;
        }
        if (label.containsKey(exact)) {
            return label.get(exact);
        }
        if (label.containsKey(language)) {
            return label.get(language);
        }
        return label.get(defaultLocale);
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
