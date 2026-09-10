package com.sportconnect.common.attributes.validate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.AttributeOption;
import com.sportconnect.common.attributes.json.AttributeJson;
import com.sportconnect.common.exception.BadRequestException;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The leaf rules a schema node obeys regardless of which validator walks it — lifted from sport
 * {@code SchemaChecks} (A9/A12/A13/A19), minus the per-type {@code validateAttribute} switch (now
 * {@link NodeValidators}) and the {@code definitions} 3-pass (now {@link DefinitionRegistryValidator}).
 *
 * <p>All-or-nothing: the first violation throws {@link BadRequestException}, naming the offending
 * node.
 *
 * <p><strong>Visibility:</strong> {@code public} only so the sibling {@code pair} package (C9's
 * derived-schema validator) can reuse the exact same leaf rules over a derived schema's own nodes —
 * it is framework-internal, not a supported API for consumers outside {@code common.attributes}.
 */
public final class LeafChecks {

    /** Safe as both a JSON object key and a client form field name, so no layer needs escaping rules. */
    static final Pattern KEY_PATTERN = Pattern.compile("^[a-z][a-zA-Z0-9_]*$");

    /** PascalCase — a definition name is a type namespace, never written into a stored value. */
    static final Pattern DEFINITION_NAME_PATTERN = Pattern.compile("^[A-Z][a-zA-Z0-9]*$");

    /** BCP 47 language tag, permissively — catches typos like {@code "vi_VN"} without a subtag registry. */
    public static final Pattern LOCALE_PATTERN = Pattern.compile("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$");

    /** 16KB — a schema carries labels and option lists, not just values. Admin-only write. */
    static final int MAX_SCHEMA_BYTES = 16384;

    private LeafChecks() {
    }

    public static void validateDefaultLocale(String defaultLocale) {
        if (defaultLocale == null || !LOCALE_PATTERN.matcher(defaultLocale).matches()) {
            throw new BadRequestException("Schema defaultLocale must match " + LOCALE_PATTERN.pattern()
                    + " but was: " + defaultLocale);
        }
    }

    public static void validateKey(String key, String what) {
        if (key == null || !KEY_PATTERN.matcher(key).matches()) {
            throw new BadRequestException(what + " must match " + KEY_PATTERN.pattern() + " but was: " + key);
        }
    }

    /**
     * Every labeled node (group, attribute, option, field) must carry an entry for the document's
     * {@code defaultLocale} — the one rule that makes resolution total (A13): a missing label is
     * caught here at {@code PUT} time, never at render time. Every locale key present is checked
     * against {@link #LOCALE_PATTERN}, not just the default one.
     */
    public static void validateLabel(Map<String, String> label, String defaultLocale, String context) {
        if (label == null || label.isEmpty()) {
            throw new BadRequestException(context + " must declare a label for locale " + defaultLocale);
        }
        for (String locale : label.keySet()) {
            if (locale == null || !LOCALE_PATTERN.matcher(locale).matches()) {
                throw new BadRequestException(context + " has a malformed label locale: " + locale);
            }
        }
        if (!label.containsKey(defaultLocale)) {
            throw new BadRequestException(context + " label is missing the schema's defaultLocale: " + defaultLocale);
        }
    }

    /**
     * {@code ENUM}/{@code LIST} options: non-empty, each with a non-blank unique {@code value}, and
     * each option's own label checked exactly like every other labeled node.
     */
    static void validateOptionsList(String context, List<AttributeOption> options, String typeName,
                                    String defaultLocale) {
        List<AttributeOption> list = options == null ? List.of() : options;
        if (list.isEmpty()) {
            throw new BadRequestException(context + " is " + typeName + " and must declare at least one option");
        }
        Set<String> values = new HashSet<>();
        for (AttributeOption option : list) {
            if (option.getValue() == null || option.getValue().isBlank()) {
                throw new BadRequestException(context + " has an option with no value");
            }
            if (!values.add(option.getValue())) {
                throw new BadRequestException(context + " has duplicate option value: " + option.getValue());
            }
            validateLabel(option.getLabel(), defaultLocale, context + " option " + option.getValue());
        }
    }

    /**
     * C11 {@code layout} <strong>shape</strong> sanity — the only structural gate on a presentation
     * hint. A {@code layout} is either absent or an object with a non-blank {@code id}; an
     * <em>unknown</em> {@code id}, {@code icon} or {@code format} value is never rejected (the client
     * owns the vocabulary and degrades gracefully). {@code layout} being a non-object is already
     * impossible here — the strict framework mapper fails that at parse.
     */
    public static void validateLayout(AttributeLayout layout, String context) {
        if (layout != null && (layout.getId() == null || layout.getId().isBlank())) {
            throw new BadRequestException(context + " has a layout with no id");
        }
    }

    /**
     * Serialised-byte cap, via the framework's own strict mapper. {@code subject} names the document
     * in the message so a derived-schema caller (C9) can keep its own wording.
     */
    public static void validateSize(Object schema, String subject) {
        try {
            byte[] json = AttributeJson.mapper().writeValueAsBytes(schema);
            if (json.length > MAX_SCHEMA_BYTES) {
                throw new BadRequestException(subject + " exceeds the maximum allowed size (16KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid " + subject.toLowerCase(Locale.ROOT));
        }
    }

    public static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
