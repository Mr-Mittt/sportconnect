package com.sportconnect.common.attributes.pair

import com.fasterxml.jackson.core.JsonProcessingException
import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.Cardinality
import com.sportconnect.common.attributes.field.AttributeField
import com.sportconnect.common.attributes.field.StringField
import com.sportconnect.common.attributes.json.AttributeJson
import com.sportconnect.common.attributes.node.AttributeNode
import com.sportconnect.common.attributes.node.BooleanAttribute
import com.sportconnect.common.attributes.node.DefinitionAttribute
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.ListAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.RefAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

/**
 * C9: port of sport {@code SessionAttributeSchemaValidatorSpec} (292 ln) onto the neutral sealed
 * model, plus the {@code #ref} semantics change of extraction plan D9 — an explicit {@code key} and
 * {@code cardinality} are now required on every {@code #ref}. Every accept/reject outcome of the
 * original is preserved (D11); the two cases the sealed model now rejects one layer earlier (a
 * {@code #ref} carrying a forbidden field; an own node with no type) moved to the "rejected at
 * parse" section.
 */
class DerivedSchemaValidatorSpec extends Specification {

    @Subject
    DerivedSchemaValidator validator = new DerivedSchemaValidator()

    // ---- derived-schema builders ----

    private static AttributeSchema derived(List<AttributeGroup> groups,
                                           List<AttributeDefinitionType> definitions = null,
                                           String defaultLocale = "en") {
        AttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale(defaultLocale).build()
    }

    private static AttributeGroup dGroup(String key, List<AttributeNode> attributes,
                                         List<AttributeGroup> groups = null) {
        AttributeGroup.builder().key(key).label(["en": key]).isAvailable(true).attributes(attributes).groups(groups).build()
    }

    private static RefAttribute ref(String key, String path, Cardinality cardinality = Cardinality.SINGLE,
                                    Map<String, String> label = null) {
        RefAttribute.builder().key(key).ref(path).cardinality(cardinality).label(label).build()
    }

    private static StringAttribute own(String key) {
        StringAttribute.builder().key(key).label(["en": key]).isAvailable(true).build()
    }

    private static NumberAttribute ownNumber(String key) {
        NumberAttribute.builder().key(key).label(["en": key]).isAvailable(true).build()
    }

    private static BooleanAttribute ownBoolean(String key) {
        BooleanAttribute.builder().key(key).label(["en": key]).isAvailable(true).build()
    }

    // ---- base-schema builders ----

    private static AttributeSchema base(List<AttributeGroup> groups,
                                        List<AttributeDefinitionType> definitions = null) {
        AttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale("en").build()
    }

    private static AttributeGroup bGroup(String key, List<AttributeNode> attributes,
                                         boolean available = true, List<AttributeGroup> groups = null) {
        AttributeGroup.builder().key(key).label(["en": key]).isAvailable(available).attributes(attributes).groups(groups).build()
    }

    private static StringAttribute bAttr(String key, boolean available = true) {
        StringAttribute.builder().key(key).label(["en": key]).isAvailable(available).build()
    }

    private static NumberAttribute bNumber(String key, boolean available = true) {
        NumberAttribute.builder().key(key).label(["en": key]).isAvailable(available).build()
    }

    private static DefinitionAttribute bDefinition(String key, String definitionRef, boolean available = true) {
        DefinitionAttribute.builder().key(key).label(["en": key]).isAvailable(available).definitionRef(definitionRef).build()
    }

    private static AttributeDefinitionType defType(String name, List<AttributeField> fields) {
        AttributeDefinitionType.builder().name(name).fields(fields).build()
    }

    private static StringField field(String key) {
        StringField.builder().key(key).label(["en": key]).isRequired(false).build()
    }

    private static AttributeSchema badmintonBase() {
        base([
                bGroup("general", [bAttr("handedness")]),
                bGroup("gear", [bAttr("shoeSize")], true, [
                        bGroup("rackets", [bNumber("tension")])
                ])
        ])
    }

    // ---- tests: ported from SessionAttributeSchemaValidatorSpec ----

    def "a null derived schema is valid"() {
        expect:
        validator.validate(badmintonBase(), null)
    }

    def "an own node plus a #ref to a live base attribute passes"() {
        given:
        def schema = derived([
                dGroup("setup", [
                        ownBoolean("ballsProvided"),
                        ref("tension", "gear/rackets/tension")
                ])
        ])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        noExceptionThrown()
    }

    def "a #ref to a path that does not exist in the base schema is rejected"() {
        given:
        def schema = derived([dGroup("setup", [ref("nope", "gear/rackets/nope")])])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("gear/rackets/nope")
    }

    def "a #ref to an unavailable base attribute is rejected"() {
        given:
        def baseSchema = base([bGroup("gear", [bNumber("tension", false)])])
        def schema = derived([dGroup("setup", [ref("tension", "gear/tension")])])

        when:
        validator.validate(baseSchema, schema)

        then:
        thrown(BadRequestException)
    }

    def "a #ref to an attribute under an unavailable base group is rejected"() {
        given:
        def baseSchema = base([bGroup("gear", [bNumber("tension")], false)])
        def schema = derived([dGroup("setup", [ref("tension", "gear/tension")])])

        when:
        validator.validate(baseSchema, schema)

        then:
        thrown(BadRequestException)
    }

    def "a #ref against a null base schema is a dangling reference"() {
        given:
        def schema = derived([dGroup("setup", [ref("tension", "gear/rackets/tension")])])

        when:
        validator.validate(null, schema)

        then:
        thrown(BadRequestException)
    }

    def "two #refs to the same base path are rejected"() {
        given:
        def schema = derived([
                dGroup("a", [ref("t1", "gear/rackets/tension")]),
                dGroup("b", [ref("t2", "gear/rackets/tension")])
        ])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Duplicate #ref")
    }

    def "a #ref key colliding with a sibling own node key is rejected"() {
        given: "own node 'tension' and a #ref keyed 'tension' share group 'setup'"
        def schema = derived([
                dGroup("setup", [ownNumber("tension"), ref("tension", "gear/rackets/tension")])
        ])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Duplicate node key among siblings")
    }

    def "an own DEFINITION node whose definitionRef is not in the derived-local registry is rejected"() {
        given:
        def node = DefinitionAttribute.builder()
                .key("prize").label(["en": "Prize"]).isAvailable(true).definitionRef("Missing").build()
        def schema = derived([dGroup("setup", [node])])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        thrown(BadRequestException)
    }

    def "an own DEFINITION node resolving against the derived-local registry passes"() {
        given:
        def registry = [defType("Prize", [field("name"), field("value")])]
        def node = DefinitionAttribute.builder()
                .key("prize").label(["en": "Prize"]).isAvailable(true).definitionRef("Prize").build()
        def schema = derived([dGroup("setup", [node])], registry)

        when:
        validator.validate(badmintonBase(), schema)

        then:
        noExceptionThrown()
    }

    def "a derived-local definition name colliding with one a #ref pulls in from the base schema is rejected"() {
        given: "base 'rackets' is a DEFINITION using base definition 'Reference'; derived declares its own 'Reference'"
        def baseSchema = base([
                bGroup("gear", [bDefinition("rackets", "Reference")])
        ], [defType("Reference", [field("value")])])
        def registry = [defType("Reference", [field("name")])]
        def schema = derived([dGroup("setup", [ref("rackets", "gear/rackets")])], registry)

        when:
        validator.validate(baseSchema, schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Reference")
    }

    def "a missing defaultLocale is rejected"() {
        given:
        def schema = derived([dGroup("setup", [own("mode")])], null, null)

        when:
        validator.validate(badmintonBase(), schema)

        then:
        thrown(BadRequestException)
    }

    def "sibling namespace is per parent - the same own key is legal under two different groups"() {
        given:
        def schema = derived([
                dGroup("a", [own("mode")]),
                dGroup("b", [own("mode")])
        ])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        noExceptionThrown()
    }

    def "nested derived groups: a #ref and an own node deep in the tree pass"() {
        given:
        def schema = derived([
                dGroup("outer", [own("a")], [
                        dGroup("inner", [own("b"), ref("tension", "gear/rackets/tension")])
                ])
        ])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        noExceptionThrown()
    }

    // ---- tests: new #ref contract (extraction plan D9, ticket §8) ----

    def "a #ref with no key is rejected"() {
        given:
        def node = RefAttribute.builder().ref("gear/rackets/tension").cardinality(Cardinality.SINGLE).build()
        def schema = derived([dGroup("setup", [node])])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("#ref key")
    }

    def "a #ref with no cardinality is rejected"() {
        given:
        def node = RefAttribute.builder().key("tension").ref("gear/rackets/tension").build()
        def schema = derived([dGroup("setup", [node])])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("cardinality")
    }

    def "a #ref with a blank ref path is rejected"() {
        given:
        def node = RefAttribute.builder().key("tension").ref("  ").cardinality(Cardinality.SINGLE).build()
        def schema = derived([dGroup("setup", [node])])

        when:
        validator.validate(badmintonBase(), schema)

        then:
        thrown(BadRequestException)
    }

    @Unroll
    def "all four cardinality x base-shape combos validate: #description"() {
        given:
        def baseSchema = base([bGroup("prefs", [
                EnumAttribute.builder().key("speed").label(["en": "Speed"]).isAvailable(true)
                        .options([AttributeOption.builder().value("fast").label(["en": "Fast"]).build(),
                                  AttributeOption.builder().value("slow").label(["en": "Slow"]).build()]).build(),
                ListAttribute.builder().key("surfaces").label(["en": "Surfaces"]).isAvailable(true)
                        .options([AttributeOption.builder().value("wood").label(["en": "Wood"]).build(),
                                  AttributeOption.builder().value("mat").label(["en": "Mat"]).build()]).build()
        ])])
        def schema = derived([dGroup("setup", [ref("pick", "prefs/" + basePath, cardinality)])])

        expect:
        validator.validate(baseSchema, schema)

        where:
        description                     | basePath   | cardinality
        "SINGLE off a single-valued base" | "speed"    | Cardinality.SINGLE
        "LIST off a single-valued base"   | "speed"    | Cardinality.LIST
        "SINGLE off a list-valued base"   | "surfaces" | Cardinality.SINGLE
        "LIST off a list-valued base"     | "surfaces" | Cardinality.LIST
    }

    // ---- structurally rejected at parse (was a validator rule in the flat model) ----

    @Unroll
    def "structurally rejected at parse: #description"() {
        when:
        AttributeJson.mapper().readValue(json, AttributeSchema)

        then:
        thrown(JsonProcessingException)

        where:
        description                                  | json
        "a #ref node carrying a forbidden field"     | node('{"type":"REF","key":"x","#ref":"gear/tension","cardinality":"SINGLE","min":1}')
        "a #ref node carrying options"               | node('{"type":"REF","key":"x","#ref":"gear/tension","cardinality":"SINGLE","options":[]}')
        "a #ref node with an unknown cardinality"    | node('{"type":"REF","key":"x","#ref":"gear/tension","cardinality":"MANY"}')
        "an own node with no type"                   | node('{"key":"x","label":{"en":"x"}}')
    }

    /** Wrap a raw node JSON into a minimal one-group derived schema document. */
    private static String node(String nodeJson) {
        '{"defaultLocale":"en","groups":[{"key":"g","label":{"en":"G"},"attributes":[' + nodeJson + ']}]}'
    }
}
