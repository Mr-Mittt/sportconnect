package com.sportconnect.sport.service

import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType
import com.sportconnect.sport.api.dto.SportAttributeField
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeOption
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import spock.lang.Specification
import spock.lang.Subject

/**
 * A13: locale resolution — exact locale tag → language-only → the document's own
 * {@code defaultLocale}. Every case here assumes a document that already passed
 * {@link SportAttributeSchemaValidator}, so every labeled node is guaranteed to carry a
 * {@code defaultLocale} entry.
 */
class SportAttributeSchemaLabelResolverSpec extends Specification {

    @Subject
    SportAttributeSchemaLabelResolver resolver = new SportAttributeSchemaLabelResolver()

    private static SportAttributeSchema schemaWithGroupLabel(Map<String, String> groupLabel, String defaultLocale = "en") {
        SportAttributeSchema.builder()
                .defaultLocale(defaultLocale)
                .groups([SportAttributeGroup.builder()
                                 .key("gear").label(groupLabel).isAvailable(true).order(1)
                                 .attributes([]).build()])
                .build()
    }

    def "null schema resolves to null"() {
        expect:
        resolver.resolve(null, Locale.ENGLISH) == null
    }

    def "an exact locale tag match wins over language-only and default"() {
        given:
        def schema = schemaWithGroupLabel(["en": "Gear", "en-US": "Gear (US)", "vi": "Đồ nghề"])

        when:
        def result = resolver.resolve(schema, Locale.forLanguageTag("en-US"))

        then:
        result.groups[0].label == "Gear (US)"
    }

    def "a language-only match wins over the default when no exact tag is present"() {
        given: "the caller asks for vi-VN, the document only has a bare 'vi' entry"
        def schema = schemaWithGroupLabel(["en": "Gear", "vi": "Đồ nghề"])

        when:
        def result = resolver.resolve(schema, Locale.forLanguageTag("vi-VN"))

        then:
        result.groups[0].label == "Đồ nghề"
    }

    def "falls back to defaultLocale when neither exact nor language-only matches"() {
        given:
        def schema = schemaWithGroupLabel(["en": "Gear", "vi": "Đồ nghề"])

        when:
        def result = resolver.resolve(schema, Locale.forLanguageTag("fr-FR"))

        then:
        result.groups[0].label == "Gear"
    }

    def "a document with only the default locale resolves the same way for any request locale"() {
        given:
        def schema = schemaWithGroupLabel(["en": "Gear"])

        expect:
        resolver.resolve(schema, Locale.forLanguageTag(locale)).groups[0].label == "Gear"

        where:
        locale << ["en", "en-US", "vi", "vi-VN", "fr"]
    }

    def "resolves labels through the whole tree - definitions, groups, attributes, options, and fields"() {
        given:
        def definition = SportAttributeDefinitionType.builder().name("Reference").fields([
                SportAttributeField.builder().key("value")
                        .label(["en": "Value", "vi": "Giá trị"])
                        .type(SportAttributeType.STRING).order(1).build()
        ]).build()
        def schema = SportAttributeSchema.builder()
                .defaultLocale("en")
                .definitions([definition])
                .groups([SportAttributeGroup.builder()
                                 .key("gear").label(["en": "Gear", "vi": "Đồ nghề"]).isAvailable(true).order(1)
                                 .attributes([SportAttributeDefinition.builder()
                                                      .key("shuttlecock").label(["en": "Shuttlecock", "vi": "Cầu lông"])
                                                      .type(SportAttributeType.ENUM)
                                                      .options([SportAttributeOption.builder()
                                                                        .value("nylon")
                                                                        .label(["en": "Nylon", "vi": "Nylon"])
                                                                        .build()])
                                                      .isAvailable(true).order(1).build()])
                                 .build()])
                .build()

        when:
        def result = resolver.resolve(schema, Locale.forLanguageTag("vi"))

        then:
        result.definitions[0].fields[0].label == "Giá trị"
        result.groups[0].label == "Đồ nghề"
        result.groups[0].attributes[0].label == "Cầu lông"
        result.groups[0].attributes[0].options[0].label == "Nylon"
    }

    def "carries every non-label field through unchanged"() {
        given:
        def schema = SportAttributeSchema.builder()
                .defaultLocale("en")
                .groups([SportAttributeGroup.builder()
                                 .key("gear").label(["en": "Gear"]).isAvailable(true).order(1)
                                 .attributes([SportAttributeDefinition.builder()
                                                      .key("racket").label(["en": "Racket"])
                                                      .type(SportAttributeType.STRING)
                                                      .isAvailable(true).order(2).defaultValue("Yonex")
                                                      .build()])
                                 .build()])
                .build()

        when:
        def result = resolver.resolve(schema, Locale.ENGLISH)

        then:
        def group = result.groups[0]
        group.key == "gear"
        group.isAvailable == true
        group.order == 1
        def attribute = group.attributes[0]
        attribute.key == "racket"
        attribute.type == SportAttributeType.STRING
        attribute.isAvailable == true
        attribute.order == 2
        attribute.defaultValue == "Yonex"
    }

    def "carries a NUMBER attribute's min/max through to the resolved tree (A16)"() {
        given:
        def spec = SportAttributeDefinitionType.builder().name("Spec").fields([
                SportAttributeField.builder().key("gauge").label(["en": "Gauge"])
                        .type(SportAttributeType.NUMBER).min(0.60d).max(0.75d).order(1).build()
        ]).build()
        def schema = SportAttributeSchema.builder()
                .defaultLocale("en")
                .definitions([spec])
                .groups([SportAttributeGroup.builder()
                                 .key("gear").label(["en": "Gear"]).isAvailable(true).order(1)
                                 .attributes([SportAttributeDefinition.builder()
                                                      .key("tension").label(["en": "Tension"])
                                                      .type(SportAttributeType.NUMBER).min(15.0d).max(35.0d)
                                                      .isAvailable(true).order(1).build()])
                                 .build()])
                .build()

        when:
        def result = resolver.resolve(schema, Locale.ENGLISH)

        then:
        result.groups[0].attributes[0].min == 15.0d
        result.groups[0].attributes[0].max == 35.0d
        result.definitions[0].fields[0].min == 0.60d
        result.definitions[0].fields[0].max == 0.75d
    }
}
