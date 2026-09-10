package com.sportconnect.common.attributes.resolve

import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeFieldLayout
import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeLayout
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.AttributeType
import com.sportconnect.common.attributes.Cardinality
import com.sportconnect.common.attributes.field.NumberField
import com.sportconnect.common.attributes.field.StringField
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.RefAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C8: port of sport {@code SportAttributeSchemaLabelResolverSpec} — locale resolution
 * (exact tag → language-only → {@code defaultLocale}) over the neutral sealed model, into the flat
 * {@code ResolvedAttribute*} DTOs. Behaviour parity, extraction plan D11.
 */
class AttributeSchemaResolverSpec extends Specification {

    private static AttributeSchema schemaWithGroupLabel(Map<String, String> groupLabel, String defaultLocale = "en") {
        AttributeSchema.builder().defaultLocale(defaultLocale).groups([
                AttributeGroup.builder().key("gear").label(groupLabel).isAvailable(true).attributes([]).build()
        ]).build()
    }

    def "null schema resolves to null"() {
        expect:
        AttributeSchemaResolver.resolve(null, Locale.ENGLISH) == null
    }

    def "an exact locale tag match wins over language-only and default"() {
        given:
        def schema = schemaWithGroupLabel([en: "Gear", "en-US": "Gear (US)", vi: "Đồ nghề"])

        expect:
        AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("en-US")).groups[0].label == "Gear (US)"
    }

    def "a language-only match wins over the default when no exact tag is present"() {
        given:
        def schema = schemaWithGroupLabel([en: "Gear", vi: "Đồ nghề"])

        expect:
        AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("vi-VN")).groups[0].label == "Đồ nghề"
    }

    def "falls back to defaultLocale when neither exact nor language-only matches"() {
        given:
        def schema = schemaWithGroupLabel([en: "Gear", vi: "Đồ nghề"])

        expect:
        AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("fr-FR")).groups[0].label == "Gear"
    }

    @Unroll
    def "a document with only the default locale resolves the same way for #locale"() {
        expect:
        AttributeSchemaResolver.resolve(schemaWithGroupLabel([en: "Gear"]), Locale.forLanguageTag(locale)).groups[0].label == "Gear"

        where:
        locale << ["en", "en-US", "vi", "vi-VN", "fr"]
    }

    def "resolves labels through the whole tree - definitions, groups, attributes, options, and fields"() {
        given:
        def definition = AttributeDefinitionType.builder().name("Reference").fields([
                StringField.builder().key("value").label([en: "Value", vi: "Giá trị"]).isRequired(false).build()
        ]).build()
        def schema = AttributeSchema.builder().defaultLocale("en").definitions([definition]).groups([
                AttributeGroup.builder().key("gear").label([en: "Gear", vi: "Đồ nghề"]).isAvailable(true).attributes([
                        EnumAttribute.builder().key("shuttlecock").label([en: "Shuttlecock", vi: "Cầu lông"]).isAvailable(true)
                                .options([AttributeOption.builder().value("nylon").label([en: "Nylon", vi: "Nylon"]).build()]).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("vi"))

        then:
        result.definitions[0].fields[0].label == "Giá trị"
        result.groups[0].label == "Đồ nghề"
        result.groups[0].attributes[0].label == "Cầu lông"
        result.groups[0].attributes[0].options[0].label == "Nylon"
    }

    def "carries every non-label field through unchanged"() {
        given:
        def schema = AttributeSchema.builder().defaultLocale("en").groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(true).attributes([
                        StringAttribute.builder().key("racket").label([en: "Racket"]).isAvailable(true).defaultValue("Yonex").build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.ENGLISH)

        then:
        with(result.groups[0]) {
            key == "gear"
            isAvailable == true
        }
        with(result.groups[0].attributes[0]) {
            key == "racket"
            type == AttributeType.STRING
            isAvailable == true
            defaultValue == "Yonex"
        }
    }

    def "resolves labels recursively through nested sub-groups"() {
        given:
        def schema = AttributeSchema.builder().defaultLocale("en").groups([
                AttributeGroup.builder().key("gear").label([en: "Gear", vi: "Đồ nghề"]).isAvailable(true).attributes([]).groups([
                        AttributeGroup.builder().key("rackets").label([en: "Rackets", vi: "Vợt"]).isAvailable(true).attributes([
                                StringAttribute.builder().key("tension").label([en: "Tension", vi: "Độ căng"]).isAvailable(true).build()
                        ]).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("vi"))

        then:
        result.groups[0].label == "Đồ nghề"
        result.groups[0].groups[0].label == "Vợt"
        result.groups[0].groups[0].attributes[0].label == "Độ căng"
    }

    def "carries a NUMBER attribute's and field's min/max through to the resolved tree"() {
        given:
        def spec = AttributeDefinitionType.builder().name("Spec").fields([
                NumberField.builder().key("gauge").label([en: "Gauge"]).isRequired(false).min(0.60d).max(0.75d).build()
        ]).build()
        def schema = AttributeSchema.builder().defaultLocale("en").definitions([spec]).groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(true).attributes([
                        NumberAttribute.builder().key("tension").label([en: "Tension"]).min(15.0d).max(35.0d).isAvailable(true).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.ENGLISH)

        then:
        result.groups[0].attributes[0].min == 15.0d
        result.groups[0].attributes[0].max == 35.0d
        result.definitions[0].fields[0].min == 0.60d
        result.definitions[0].fields[0].max == 0.75d
    }

    def "a #ref node reaching a single-schema resolve is resolved to key + label only, type null, no throw"() {
        given: "shouldn't happen (C6 rejects it) but the resolver must stay total"
        def schema = AttributeSchema.builder().defaultLocale("en").groups([
                AttributeGroup.builder().key("session").label([en: "Session"]).isAvailable(true).attributes([
                        RefAttribute.builder().key("shuttlecock").label([en: "Shuttlecock"])
                                .ref("gear/shuttlecocks").cardinality(Cardinality.SINGLE).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.ENGLISH)

        then:
        noExceptionThrown()
        with(result.groups[0].attributes[0]) {
            key == "shuttlecock"
            label == "Shuttlecock"
            type == null
            cardinality == null
            prefillable == null
        }
    }

    def "C11 layout / hidden reach the resolved node, field and group verbatim - format stays a raw map"() {
        given:
        def nodeLayout = AttributeLayout.builder().id("slider").icon("ruler")
                .format([en: "#,##0 cm", vi: "#,##0 cm"]).build()
        def fieldLayout = AttributeLayout.builder().id("stepper").format([en: "0.0"]).build()
        def def0 = AttributeDefinitionType.builder().name("Spec").fields([
                NumberField.builder().key("gauge").label([en: "Gauge"]).isRequired(false)
                        .layout(fieldLayout).hidden(true).build()
        ]).build()
        def schema = AttributeSchema.builder().defaultLocale("en").definitions([def0]).groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(true)
                        .layout(AttributeLayout.builder().id("grid-2").build()).hidden(false).attributes([
                        NumberAttribute.builder().key("tension").label([en: "Tension"]).isAvailable(true)
                                .layout(nodeLayout).hidden(true).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.forLanguageTag("vi"))

        then: "node"
        with(result.groups[0].attributes[0]) {
            layout.id == "slider"
            layout.icon == "ruler"
            layout.format == [en: "#,##0 cm", vi: "#,##0 cm"]   // NOT resolved to one string
            hidden == true
        }

        and: "group"
        result.groups[0].layout.id == "grid-2"
        result.groups[0].hidden == false

        and: "definition field"
        with(result.definitions[0].fields[0]) {
            layout.id == "stepper"
            layout.format == [en: "0.0"]
            hidden == true
        }
    }

    def "a #ref node's own layout / hidden / fieldLayouts reach the resolved node on a single-schema resolve"() {
        given: "not a real path (C6 rejects a #ref here) but the resolver must still carry its C11 fields"
        def schema = AttributeSchema.builder().defaultLocale("en").groups([
                AttributeGroup.builder().key("session").label([en: "Session"]).isAvailable(true).attributes([
                        RefAttribute.builder().key("shuttlecock").label([en: "Shuttlecock"])
                                .ref("gear/shuttlecocks").cardinality(Cardinality.SINGLE)
                                .layout(AttributeLayout.builder().id("radio").build()).hidden(true)
                                .fieldLayouts([value: AttributeFieldLayout.builder().id("input").build()]).build()
                ]).build()
        ]).build()

        when:
        def result = AttributeSchemaResolver.resolve(schema, Locale.ENGLISH)

        then:
        with(result.groups[0].attributes[0]) {
            layout.id == "radio"
            hidden == true
            fieldLayouts["value"].id == "input"
        }
    }

    def "a null label map resolves to a null label without NPE"() {
        given:
        def schema = AttributeSchema.builder().defaultLocale("en").groups([
                AttributeGroup.builder().key("gear").label(null).isAvailable(true).attributes([]).build()
        ]).build()

        expect:
        AttributeSchemaResolver.resolve(schema, Locale.ENGLISH).groups[0].label == null
    }
}
