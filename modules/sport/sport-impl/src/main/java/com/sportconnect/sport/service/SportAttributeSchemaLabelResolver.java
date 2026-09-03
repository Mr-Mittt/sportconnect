package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.ResolvedSportAttributeDefinition;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeField;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeGroup;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeOption;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeField;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Resolves a raw, multi-locale {@link SportAttributeSchema} (every {@code label} a
 * {@code Map<String, String>}) into a {@link ResolvedSportAttributeSchema} (every {@code label} a
 * single {@code String}) for one caller's locale (A13, v2 design §7.3–§7.4).
 *
 * <p><strong>Called only from {@code SportController.getAttributeSchema}</strong> — the
 * member-facing {@code GET}. Never from {@code SportServiceImpl.getAttributeSchema} itself, which
 * {@code UserSportProfileServiceImpl} also calls on every profile write to filter submitted
 * attributes, a path that never touches labels; resolving there would do per-locale work on every
 * write for nothing and would break the locale-independence that lets {@code SportLookupCache}
 * cache one document for all users. The admin twin ({@code getAttributeSchemaForAdmin}) is never
 * passed through this class — the editor needs every locale, i.e. the raw {@link SportAttributeSchema}
 * as-is.
 *
 * <p>Resolution order per label: exact locale tag → language-only tag → the document's own
 * {@code defaultLocale}. {@link SportAttributeSchemaValidator} guarantees every label carries a
 * {@code defaultLocale} entry, so the last step never misses in practice.
 */
@Component
public class SportAttributeSchemaLabelResolver {

    /**
     * @param schema the raw, admin-authored document; {@code null} means "offers no attributes"
     *               and resolves to {@code null}
     * @param locale the caller's resolved locale (from {@code Accept-Language}, via Spring's
     *               default {@code LocaleResolver})
     * @return the same tree with every {@code label} collapsed to one string for {@code locale}
     */
    public ResolvedSportAttributeSchema resolve(SportAttributeSchema schema, Locale locale) {
        if (schema == null) {
            return null;
        }
        String exact = locale.toLanguageTag();
        String language = locale.getLanguage();
        String defaultLocale = schema.getDefaultLocale();

        return ResolvedSportAttributeSchema.builder()
                .definitions(nullSafe(schema.getDefinitions()).stream()
                        .map(definition -> resolveDefinitionType(definition, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .groups(nullSafe(schema.getGroups()).stream()
                        .map(group -> resolveGroup(group, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    private ResolvedSportAttributeDefinitionType resolveDefinitionType(SportAttributeDefinitionType definition,
                                                                        String exact, String language, String defaultLocale) {
        return ResolvedSportAttributeDefinitionType.builder()
                .name(definition.getName())
                .fields(nullSafe(definition.getFields()).stream()
                        .map(field -> resolveField(field, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    private ResolvedSportAttributeField resolveField(SportAttributeField field,
                                                       String exact, String language, String defaultLocale) {
        return ResolvedSportAttributeField.builder()
                .key(field.getKey())
                .label(resolveLabel(field.getLabel(), exact, language, defaultLocale))
                .type(field.getType())
                .options(nullSafe(field.getOptions()).stream()
                        .map(option -> resolveOption(option, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .min(field.getMin())
                .max(field.getMax())
                .definitionRef(field.getDefinitionRef())
                .isRequired(field.getIsRequired())
                .order(field.getOrder())
                .build();
    }

    private ResolvedSportAttributeGroup resolveGroup(SportAttributeGroup group,
                                                       String exact, String language, String defaultLocale) {
        return ResolvedSportAttributeGroup.builder()
                .key(group.getKey())
                .label(resolveLabel(group.getLabel(), exact, language, defaultLocale))
                .isAvailable(group.getIsAvailable())
                .order(group.getOrder())
                .attributes(nullSafe(group.getAttributes()).stream()
                        .map(attribute -> resolveAttribute(attribute, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .build();
    }

    private ResolvedSportAttributeDefinition resolveAttribute(SportAttributeDefinition attribute,
                                                                String exact, String language, String defaultLocale) {
        return ResolvedSportAttributeDefinition.builder()
                .key(attribute.getKey())
                .label(resolveLabel(attribute.getLabel(), exact, language, defaultLocale))
                .type(attribute.getType())
                .options(nullSafe(attribute.getOptions()).stream()
                        .map(option -> resolveOption(option, exact, language, defaultLocale))
                        .collect(Collectors.toList()))
                .isAvailable(attribute.getIsAvailable())
                .order(attribute.getOrder())
                .defaultValue(attribute.getDefaultValue())
                .min(attribute.getMin())
                .max(attribute.getMax())
                .definitionRef(attribute.getDefinitionRef())
                .searchScope(attribute.getSearchScope())
                .build();
    }

    private ResolvedSportAttributeOption resolveOption(SportAttributeOption option,
                                                         String exact, String language, String defaultLocale) {
        return ResolvedSportAttributeOption.builder()
                .value(option.getValue())
                .label(resolveLabel(option.getLabel(), exact, language, defaultLocale))
                .build();
    }

    private String resolveLabel(Map<String, String> label, String exact, String language, String defaultLocale) {
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
