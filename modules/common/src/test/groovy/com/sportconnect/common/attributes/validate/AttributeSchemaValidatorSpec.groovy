package com.sportconnect.common.attributes.validate

import com.fasterxml.jackson.core.JsonProcessingException
import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.Cardinality
import com.sportconnect.common.attributes.field.AttributeField
import com.sportconnect.common.attributes.field.BooleanField
import com.sportconnect.common.attributes.field.DefinitionField
import com.sportconnect.common.attributes.field.EnumField
import com.sportconnect.common.attributes.field.NumberField
import com.sportconnect.common.attributes.field.StringField
import com.sportconnect.common.attributes.json.AttributeJson
import com.sportconnect.common.attributes.node.AttributeNode
import com.sportconnect.common.attributes.node.BooleanAttribute
import com.sportconnect.common.attributes.node.DefinitionAttribute
import com.sportconnect.common.attributes.node.DefinitionListAttribute
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.ListAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.RefAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C6: port of sport {@code SportAttributeSchemaValidatorSpec} (957 ln) onto the neutral sealed model
 * — every accept/reject outcome preserved (extraction plan D11). The ~15 cases the old spec covered
 * that are now <em>structurally</em> impossible (a field on the wrong subtype) moved to the
 * "rejected at parse" section, so the end-to-end coverage is unchanged even though the layer that
 * rejects them moved.
 */
class AttributeSchemaValidatorSpec extends Specification {

    // ---- builders ----

    private static AttributeOption opt(String value, Map<String, String> label = [en: value]) {
        AttributeOption.builder().value(value).label(label).build()
    }

    private static StringAttribute str(String key, Object defaultValue = null, Map<String, String> label = [en: key]) {
        StringAttribute.builder().key(key).label(label).isAvailable(true).defaultValue(defaultValue).build()
    }

    private static NumberAttribute num(String key, Object defaultValue = null, Double min = null, Double max = null) {
        NumberAttribute.builder().key(key).label([en: key]).isAvailable(true)
                .defaultValue(defaultValue).min(min).max(max).build()
    }

    private static BooleanAttribute bool(String key, Object defaultValue = null) {
        BooleanAttribute.builder().key(key).label([en: key]).isAvailable(true).defaultValue(defaultValue).build()
    }

    private static EnumAttribute enm(String key, List<AttributeOption> options, Object defaultValue = null) {
        EnumAttribute.builder().key(key).label([en: key]).isAvailable(true).options(options).defaultValue(defaultValue).build()
    }

    private static ListAttribute lst(String key, List<AttributeOption> options, Object defaultValue = null) {
        ListAttribute.builder().key(key).label([en: key]).isAvailable(true).options(options).defaultValue(defaultValue).build()
    }

    private static DefinitionAttribute defn(String key, String ref, String scope = null) {
        DefinitionAttribute.builder().key(key).label([en: key]).isAvailable(true).definitionRef(ref).searchScope(scope).build()
    }

    private static DefinitionListAttribute defnList(String key, String ref, String scope = null) {
        DefinitionListAttribute.builder().key(key).label([en: key]).isAvailable(true).definitionRef(ref).searchScope(scope).build()
    }

    private static AttributeGroup group(String key, List<AttributeNode> attributes,
                                        List<AttributeGroup> groups = null) {
        AttributeGroup.builder().key(key).label([en: key]).isAvailable(true)
                .attributes(attributes).groups(groups).build()
    }

    private static AttributeSchema schemaOf(List<AttributeGroup> groups,
                                            List<AttributeDefinitionType> definitions = null,
                                            String defaultLocale = "en") {
        AttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale(defaultLocale).build()
    }

    private static StringField sf(String key, boolean required = false) {
        StringField.builder().key(key).label([en: key]).isRequired(required).build()
    }

    private static NumberField nf(String key, boolean required = false, Double min = null, Double max = null) {
        NumberField.builder().key(key).label([en: key]).isRequired(required).min(min).max(max).build()
    }

    private static EnumField ef(String key, List<AttributeOption> options, boolean required = false) {
        EnumField.builder().key(key).label([en: key]).isRequired(required).options(options).build()
    }

    private static DefinitionField df(String key, String ref, boolean required = false) {
        DefinitionField.builder().key(key).label([en: key]).isRequired(required).definitionRef(ref).build()
    }

    private static AttributeDefinitionType defType(String name, List<AttributeField> fields) {
        AttributeDefinitionType.builder().name(name).fields(fields).build()
    }

    private static List<AttributeDefinitionType> referenceRegistry() {
        [defType("Reference", [sf("id", false), sf("value", true)])]
    }

    // ---- valid documents ----

    def "a valid document passes"() {
        given:
        def schema = schemaOf([
                group("gear", [
                        str("racket"),
                        enm("shuttlecock", [opt("feather", [en: "Feather"]), opt("nylon", [en: "Nylon"])], "nylon")
                ]),
                group("play_style", [
                        lst("preferred_shots", [opt("smash", [en: "Smash"]), opt("drop", [en: "Drop"])], ["smash"])
                ])
        ])

        expect:
        AttributeSchemaValidator.validate(schema)
    }

    def "a null document is valid and means the schema offers no attributes"() {
        expect:
        AttributeSchemaValidator.validate(null)
    }

    def "the same leaf key is legal under two different groups (v3 sibling-scoped keys)"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [str("racket")]),
                group("other", [str("racket")])
        ]))
    }

    def "the same leaf key is legal at different depths of the tree"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [str("tension")], [group("rackets", [str("tension")])])
        ]))
    }

    def "a group holding sub-groups and attributes together passes"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [str("shoeSize")], [group("rackets", [str("tension")])])
        ]))
    }

    def "an arbitrarily deep group tree passes"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("a", null, [group("b", null, [group("c", null, [group("d", [str("leaf")])])])])
        ]))
    }

    def "a document with NUMBER (bounded and unbounded) and BOOLEAN attributes passes"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [
                num("tension", 27.0d, 15.0d, 35.0d), num("weight"), bool("strung", true)
        ])]))
    }

    @Unroll
    def "a NUMBER defaultValue is accepted whether the literal is an integer or a decimal: #description"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [num("tension", defaultValue)])]))

        where:
        description       | defaultValue
        "integer literal" | 27
        "long literal"    | 27L
        "decimal literal" | 27.5d
    }

    @Unroll
    def "a NUMBER defaultValue exactly on an inclusive bound is accepted: #description"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [num("tension", defaultValue, 15.0d, 35.0d)])]))

        where:
        description | defaultValue
        "at min"    | 15.0d
        "at max"    | 35.0d
    }

    def "a defaultValue LIST at exactly the 10-item cap is accepted"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [
                lst("shots", [opt("smash", [en: "Smash"])], (1..10).collect { "smash" })
        ])]))
    }

    def "a document with multiple locales on every label, all covering defaultLocale, passes"() {
        given:
        def node = EnumAttribute.builder().key("racket").label([en: "Racket", vi: "Vợt"]).isAvailable(true)
                .options([opt("a", [en: "A", vi: "A"])]).build()

        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [node])]))
    }

    // ---- sibling key namespace ----

    def "the same leaf key is illegal among siblings in one group"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket"), str("racket")])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("racket")
    }

    def "duplicate top-level group keys are rejected (root groups are siblings)"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket")]), group("gear", [str("grip")])]))

        then:
        thrown(BadRequestException)
    }

    def "a sub-group key colliding with a sibling attribute key is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [str("rackets")], [group("rackets", [str("tension")])])
        ]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("rackets")
    }

    @Unroll
    def "keys not matching the key pattern are rejected: #key"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str(key)])]))

        then:
        thrown(BadRequestException)

        where:
        key << ["Racket", "1racket", "racket-name", "racket name", "_racket", ""]
    }

    // ---- options / enums ----

    @Unroll
    def "ENUM/LIST without options is rejected (#label)"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [node])]))

        then:
        thrown(BadRequestException)

        where:
        label            | node
        "ENUM null opts" | enm("c", null)
        "ENUM empty"     | enm("c", [])
        "LIST null opts" | lst("c", null)
        "LIST empty"     | lst("c", [])
    }

    def "duplicate option values are rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [enm("c", [opt("a"), opt("a", [en: "A again"])])])]))

        then:
        thrown(BadRequestException)
    }

    // ---- defaultValue validity ----

    @Unroll
    def "a defaultValue invalid for its own type is rejected: #description"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [node])]))

        then:
        thrown(BadRequestException)

        where:
        description                          | node
        "ENUM default not an option"         | enm("c", [opt("nylon", [en: "Nylon"])], "plastic")
        "ENUM default not a string"          | enm("c", [opt("nylon", [en: "Nylon"])], 42)
        "LIST default not a list"            | lst("c", [opt("smash", [en: "Smash"])], "smash")
        "LIST default element unknown"       | lst("c", [opt("smash", [en: "Smash"])], ["drop"])
        "LIST default over the 10-item cap"  | lst("c", [opt("smash", [en: "Smash"])], (1..11).collect { "smash" })
        "STRING default not a string"        | str("c", 42)
        "NUMBER default is a numeric string" | num("c", "27")
        "NUMBER default is a boolean"        | num("c", true)
        "NUMBER default below min"           | num("c", 10.0d, 15.0d, 35.0d)
        "NUMBER default above max"           | num("c", 40.0d, 15.0d, 35.0d)
        "BOOLEAN default is a string"        | bool("c", "true")
        "BOOLEAN default is a number"        | bool("c", 1)
    }

    def "a NUMBER attribute whose min is greater than its max is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [num("tension", null, 35.0d, 15.0d)])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("min")
    }

    // ---- size ----

    def "a document over the size cap is rejected"() {
        given:
        def attributes = (1..400).collect { str("attr_${it}" as String, null, [en: "L" * 60]) }

        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", attributes)]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("16KB")
    }

    // ---- v2 definitions registry ----

    def "a valid v2 document with definitions, DEFINITION and DEFINITION_LIST passes"() {
        given:
        def definitions = [
                defType("Reference", [sf("id", false), sf("value", true)]),
                defType("ShoeSize", [ef("system", [opt("US")], true), sf("value", true)]),
                defType("Shoe", [df("shoe", "Reference", true), df("size", "ShoeSize", false)])
        ]

        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [defnList("rackets", "Reference", "equipment.racket.badminton"), defn("footwear", "Shoe")])
        ], definitions))
    }

    def "a document declaring an empty definitions list is unaffected"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket")])], []))
    }

    @Unroll
    def "definition names not matching the pattern are rejected: #name"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType(name, [])]))

        then:
        thrown(BadRequestException)

        where:
        name << ["reference", "Reference-Type", "1Reference", "", null]
    }

    def "duplicate definition names are rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType("Reference", []), defType("Reference", [])]))

        then:
        thrown(BadRequestException)
    }

    def "duplicate field keys within one definition are rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType("Reference", [sf("value"), sf("value")])]))

        then:
        thrown(BadRequestException)
    }

    def "the same field key is allowed across two different definitions"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [
                defType("Reference", [sf("value")]), defType("ShoeSize", [sf("value")])
        ]))
    }

    def "a DEFINITION field without definitionRef is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType("Shoe", [df("shoe", null)])]))

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION field with an unresolved definitionRef is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType("Shoe", [df("shoe", "NoSuchDefinition")])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("NoSuchDefinition")
    }

    def "a definition referenced by another definition's field must contain only primitive fields"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [
                defType("Inner", [sf("value")]),
                defType("Reference", [df("nested", "Inner")]),
                defType("Shoe", [df("shoe", "Reference")])
        ]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Reference")
    }

    def "a self-referencing definition is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [defType("Node", [df("child", "Node")])]))

        then:
        thrown(BadRequestException)
    }

    def "a cycle between two definitions is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [
                defType("A", [df("b", "B")]), defType("B", [df("a", "A")])
        ]))

        then:
        thrown(BadRequestException)
    }

    def "a definition referenced only by a top-level attribute (outer position) may itself have DEFINITION fields"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [defn("footwear", "Shoe")])
        ], [
                defType("Reference", [sf("value")]), defType("Shoe", [df("shoe", "Reference")])
        ]))
    }

    def "an unreferenced definition is allowed"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket")])],
                [defType("Unused", [sf("value")])]))
    }

    def "a DEFINITION_LIST attribute without definitionRef is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [defnList("rackets", null)])]))

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION_LIST attribute with an unresolved definitionRef is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [defnList("rackets", "NoSuchDefinition")])]))

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION_LIST attribute may declare searchScope"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [defnList("rackets", "Reference", "equipment.racket.badminton")])
        ], referenceRegistry()))
    }

    def "NUMBER and BOOLEAN are legal as definition fields, including in an inner-position definition"() {
        expect:
        AttributeSchemaValidator.validate(schemaOf([
                group("gear", [defn("racket", "Racket")])
        ], [
                defType("Spec", [nf("tension", false, 15.0d, 35.0d), BooleanField.builder().key("strung").label([en: "strung"]).isRequired(false).build()]),
                defType("Racket", [df("spec", "Spec", true)])
        ]))
    }

    // ---- A13 localized labels ----

    def "a schema with no defaultLocale is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket")])], null, null))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    @Unroll
    def "a schema whose defaultLocale is not a well-formed BCP 47 tag is rejected: #defaultLocale"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket")])], null, defaultLocale))

        then:
        thrown(BadRequestException)

        where:
        defaultLocale << ["vi_VN", "1", "", "-en"]
    }

    def "a node whose label is missing the schema's defaultLocale entry is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket", null, [vi: "Vợt"])])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("racket")
        e.message.contains("defaultLocale")
    }

    def "a node with no label at all is rejected"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket", null, null)])]))

        then:
        thrown(BadRequestException)
    }

    @Unroll
    def "a node whose label carries a malformed locale key is rejected, even alongside a valid defaultLocale entry: #locale"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [str("racket", null, [en: "Racket", (locale): "x"])])]))

        then:
        thrown(BadRequestException)

        where:
        locale << ["vi_VN", "1", "-en"]
    }

    def "an option's label is checked the same way as every other labeled node"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [enm("choice", [opt("a", [vi: "A"])])])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    def "a definition field's label is checked the same way as every other labeled node"() {
        when:
        AttributeSchemaValidator.validate(schemaOf([group("gear", [])], [
                defType("Reference", [StringField.builder().key("value").label([vi: "Giá trị"]).isRequired(false).build()])
        ]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    // ---- #ref is only valid in a derived schema ----

    def "a RefAttribute anywhere in a single schema is rejected"() {
        given:
        def ref = RefAttribute.builder().key("shuttlecock").ref("gear/shuttlecocks").cardinality(Cardinality.SINGLE).build()

        when:
        AttributeSchemaValidator.validate(schemaOf([group("session", [ref])]))

        then:
        def e = thrown(BadRequestException)
        e.message.contains("#ref")
        e.message.contains("shuttlecock")
    }

    // ---- structurally rejected at parse (was a validator rule in the flat model) ----

    @Unroll
    def "structurally rejected at parse: #description"() {
        when:
        AttributeJson.mapper().readValue(json, AttributeSchema)

        then:
        thrown(JsonProcessingException)

        where:
        description                                   | json
        "a node with no type"                         | node('{"key":"x","label":{"en":"x"}}')
        "a STRING attribute carrying options"         | node('{"type":"STRING","key":"x","label":{"en":"x"},"options":[{"value":"a","label":{"en":"A"}}]}')
        "min/max on a STRING attribute"               | node('{"type":"STRING","key":"x","label":{"en":"x"},"min":1,"max":10}')
        "min/max on a BOOLEAN attribute"              | node('{"type":"BOOLEAN","key":"x","label":{"en":"x"},"min":1}')
        "options on a NUMBER attribute"               | node('{"type":"NUMBER","key":"x","label":{"en":"x"},"options":[{"value":"a","label":{"en":"A"}}]}')
        "options on a BOOLEAN attribute"              | node('{"type":"BOOLEAN","key":"x","label":{"en":"x"},"options":[{"value":"a","label":{"en":"A"}}]}')
        "options on a DEFINITION attribute"           | node('{"type":"DEFINITION","key":"x","label":{"en":"x"},"definitionRef":"R","options":[]}')
        "defaultValue on a DEFINITION attribute"      | node('{"type":"DEFINITION","key":"x","label":{"en":"x"},"definitionRef":"R","defaultValue":{"a":"b"}}')
        "definitionRef on a STRING attribute"         | node('{"type":"STRING","key":"x","label":{"en":"x"},"definitionRef":"R"}')
        "searchScope on a STRING attribute"           | node('{"type":"STRING","key":"x","label":{"en":"x"},"searchScope":"s"}')
        "a definition field of type DEFINITION_LIST"  | fieldJson('{"type":"DEFINITION_LIST","key":"x","label":{"en":"x"}}')
        "a definition field with no type"             | fieldJson('{"key":"x","label":{"en":"x"}}')
        "definitionRef on a STRING field"             | fieldJson('{"type":"STRING","key":"x","label":{"en":"x"},"definitionRef":"R"}')
        "min/max on a STRING field"                   | fieldJson('{"type":"STRING","key":"x","label":{"en":"x"},"min":1}')
    }

    /** Wrap a raw node JSON into a minimal one-group schema document. */
    private static String node(String nodeJson) {
        '{"defaultLocale":"en","groups":[{"key":"g","label":{"en":"G"},"attributes":[' + nodeJson + ']}]}'
    }

    /** Wrap a raw field JSON into a minimal one-definition schema document. */
    private static String fieldJson(String fieldJson) {
        '{"defaultLocale":"en","groups":[],"definitions":[{"name":"D","fields":[' + fieldJson + ']}]}'
    }
}
