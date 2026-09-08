package com.sportconnect.common.attributes.json;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The {@link ObjectMapper} the attribute framework parses and serialises its schema tree with.
 *
 * <p>Deliberately <strong>not</strong> the Spring-managed mapper: Spring Boot disables
 * {@code FAIL_ON_UNKNOWN_PROPERTIES}, which would let a misplaced field (a {@code min} on a
 * {@code STRING} node) sail past deserialisation to be caught only by the validator one layer later.
 * This mapper keeps that feature <strong>on</strong> (extraction plan D8) so a bad document fails at
 * parse, with a Jackson path pointing at the offending field. A consumer wiring a controller to the
 * framework (A23) must route schema (de)serialisation through here, not through the request's
 * default mapper.
 *
 * <p>The sealed {@code AttributeNode}/{@code AttributeField} hierarchies carry their own
 * {@code @JsonTypeInfo}/{@code @JsonSubTypes}, so no polymorphic type registration is needed here.
 */
public final class AttributeJson {

    private static final ObjectMapper MAPPER = newMapper();

    private AttributeJson() {
    }

    /** The shared, thread-safe, strictly-configured mapper. Do not reconfigure it — use {@link #newMapper()}. */
    public static ObjectMapper mapper() {
        return MAPPER;
    }

    /** A fresh mapper with the framework's configuration, for a caller that needs to layer more on top. */
    public static ObjectMapper newMapper() {
        return new ObjectMapper()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }
}
