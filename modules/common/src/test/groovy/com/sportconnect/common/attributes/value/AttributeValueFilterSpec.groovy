package com.sportconnect.common.attributes.value

import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.field.BooleanField
import com.sportconnect.common.attributes.field.DefinitionField
import com.sportconnect.common.attributes.field.EnumField
import com.sportconnect.common.attributes.field.NumberField
import com.sportconnect.common.attributes.field.StringField
import com.sportconnect.common.attributes.node.BooleanAttribute
import com.sportconnect.common.attributes.node.DefinitionAttribute
import com.sportconnect.common.attributes.node.DefinitionListAttribute
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.ListAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C7: the lenient half of the asymmetric validation — port of sport {@code ProfileAttributeFilterSpec}
 * onto the neutral sealed model (extraction plan D11). Every case asserts a drop, never a throw; the
 * absence of {@code thrown()} anywhere is the point. {@code retainDefined} carries over verbatim,
 * minus the "profile" framing (D10).
 */
class AttributeValueFilterSpec extends Specification {

    /** {@code UserSportProfile.attributes}-style path keying: prefix each top-level key with {@code gear/}. */
    private static Map<String, Object> g(Map<String, Object> bare) {
        bare == null ? null : bare.collectEntries { k, v -> [("gear/" + k).toString(), v] }
    }

    private static AttributeOption opt(String v, Map<String, String> label = [en: v]) {
        AttributeOption.builder().value(v).label(label).build()
    }

    private static AttributeSchema schema(boolean groupAvailable = true, boolean racketAvailable = true) {
        AttributeSchema.builder().groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(groupAvailable)
                        .attributes([
                                StringAttribute.builder().key("racket").label([en: "Racket"]).isAvailable(racketAvailable).build(),
                                EnumAttribute.builder().key("shuttlecock").label([en: "Shuttlecock"]).isAvailable(true)
                                        .options([opt("feather", [en: "Feather"]), opt("nylon", [en: "Nylon"])]).build(),
                                ListAttribute.builder().key("shots").label([en: "Shots"]).isAvailable(true)
                                        .options([opt("smash", [en: "Smash"]), opt("drop", [en: "Drop"])]).build()
                        ]).build()
        ]).build()
    }

    private static AttributeSchema schemaWithDefinitions() {
        def reference = AttributeDefinitionType.builder().name("Reference").fields([
                StringField.builder().key("id").label([en: "id"]).isRequired(false).build(),
                StringField.builder().key("value").label([en: "value"]).isRequired(true).build()
        ]).build()
        def shoeSize = AttributeDefinitionType.builder().name("ShoeSize").fields([
                EnumField.builder().key("system").label([en: "system"]).isRequired(true)
                        .options([opt("US"), opt("UK")]).build(),
                StringField.builder().key("value").label([en: "value"]).isRequired(true).build()
        ]).build()
        def shoe = AttributeDefinitionType.builder().name("Shoe").fields([
                DefinitionField.builder().key("shoe").label([en: "shoe"]).definitionRef("Reference").isRequired(true).build(),
                DefinitionField.builder().key("size").label([en: "size"]).definitionRef("ShoeSize").isRequired(false).build()
        ]).build()

        AttributeSchema.builder().definitions([reference, shoeSize, shoe]).groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(true).attributes([
                        DefinitionListAttribute.builder().key("rackets").label([en: "Rackets"])
                                .definitionRef("Reference").isAvailable(true).build(),
                        DefinitionAttribute.builder().key("footwear").label([en: "Footwear"])
                                .definitionRef("Shoe").isAvailable(true).build()
                ]).build()
        ]).build()
    }

    private static AttributeSchema schemaWithNumberAndBoolean() {
        def spec = AttributeDefinitionType.builder().name("Spec").fields([
                NumberField.builder().key("tension").label([en: "Tension"]).min(15.0d).max(35.0d).isRequired(true).build(),
                BooleanField.builder().key("strung").label([en: "Strung"]).isRequired(false).build()
        ]).build()

        AttributeSchema.builder().definitions([spec]).groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(true).attributes([
                        NumberAttribute.builder().key("tension").label([en: "Tension"]).min(15.0d).max(35.0d).isAvailable(true).build(),
                        NumberAttribute.builder().key("weight").label([en: "Weight"]).isAvailable(true).build(),
                        BooleanAttribute.builder().key("strung").label([en: "Strung"]).isAvailable(true).build(),
                        DefinitionAttribute.builder().key("racket").label([en: "Racket"]).definitionRef("Spec").isAvailable(true).build()
                ]).build()
        ]).build()
    }

    private static AttributeSchema nestedSchema(boolean gearAvailable = true, boolean racketsAvailable = true) {
        AttributeSchema.builder().groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).isAvailable(gearAvailable).groups([
                        AttributeGroup.builder().key("rackets").label([en: "Rackets"]).isAvailable(racketsAvailable).attributes([
                                StringAttribute.builder().key("tension").label([en: "Tension"]).isAvailable(true).build()
                        ]).build()
                ]).build()
        ]).build()
    }

    // ---- filter, primitives ----

    def "a valid value for each type survives"() {
        expect:
        AttributeValueFilter.filter(g([racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]]), schema()) ==
                g([racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]])
    }

    def "an unknown key is dropped, and the rest of the write still goes through"() {
        expect:
        AttributeValueFilter.filter(g([racket: "Yonex", rackettt: "typo"]), schema()) == g([racket: "Yonex"])
    }

    def "iteration order of the surviving entries follows the request, not the schema"() {
        when: "keys submitted in an order that is not the schema's declaration order"
        def result = AttributeValueFilter.filter(g([shots: ["smash"], racket: "Yonex", shuttlecock: "nylon"]), schema())

        then:
        new ArrayList<>(result.keySet()) == ["gear/shots", "gear/racket", "gear/shuttlecock"]
    }

    @Unroll
    def "a value invalid for its type is dropped rather than rejected: #description"() {
        expect:
        AttributeValueFilter.filter(g(attributes), schema()) == [:]

        where:
        description                  | attributes
        "enum value not an option"   | [shuttlecock: "plastic"]
        "enum value not a string"    | [shuttlecock: 42]
        "list sent as a string"      | [shots: "smash"]
        "list element not an option" | [shots: ["smash", "lob"]]
        "string sent as a number"    | [racket: 42]
        "null value"                 | [racket: null]
    }

    def "an empty list is kept - it is how a multi-select is cleared"() {
        expect:
        AttributeValueFilter.filter(g([shots: []]), schema()) == g([shots: []])
    }

    def "a LIST value at exactly the 10-item cap is kept"() {
        expect:
        AttributeValueFilter.filter(g([shots: (["smash", "drop"] * 5)]), schema()) == g([shots: (["smash", "drop"] * 5)])
    }

    def "a LIST value over the 10-item cap is dropped in full, not truncated"() {
        expect:
        AttributeValueFilter.filter(g([shots: (["smash", "drop"] * 5) + ["smash"]]), schema()) == [:]
    }

    def "a write targeting an unavailable attribute is dropped"() {
        expect:
        AttributeValueFilter.filter(g([racket: "Yonex", shuttlecock: "nylon"]), schema(true, false)) == g([shuttlecock: "nylon"])
    }

    def "an unavailable group hides its whole subtree, even for children still marked available"() {
        expect:
        AttributeValueFilter.filter(g([racket: "Yonex", shuttlecock: "nylon"]), schema(false, true)).isEmpty()
    }

    def "everything is dropped when there is no schema at all"() {
        expect:
        AttributeValueFilter.filter(g([racket: "Yonex"]), null).isEmpty()
    }

    def "a null or empty request yields an empty map"() {
        expect:
        AttributeValueFilter.filter(g(null), schema()).isEmpty()
        AttributeValueFilter.filter(g([:]), schema()).isEmpty()
    }

    def "an attribute omitting isAvailable is treated as available"() {
        given:
        def s = AttributeSchema.builder().groups([
                AttributeGroup.builder().key("gear").label([en: "Gear"]).attributes([
                        StringAttribute.builder().key("racket").label([en: "Racket"]).build()
                ]).build()
        ]).build()

        expect:
        AttributeValueFilter.filter(g([racket: "Yonex"]), s) == g([racket: "Yonex"])
    }

    // ---- filter, DEFINITION / DEFINITION_LIST ----

    def "a DEFINITION value with all fields valid is kept in full"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [shoe: [id: "eq_1", value: "Yonex Aerus Z2"], size: [system: "US", value: "9"]]]),
                schemaWithDefinitions()) ==
                g([footwear: [shoe: [id: "eq_1", value: "Yonex Aerus Z2"], size: [system: "US", value: "9"]]])
    }

    def "a DEFINITION value with only the required field present is kept, optional field just absent"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"]]]), schemaWithDefinitions()) ==
                g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION with its required field missing is dropped entirely"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [size: [system: "US", value: "9"]]]), schemaWithDefinitions()) == [:]
    }

    def "a DEFINITION with an invalid OPTIONAL nested field is kept, that field alone is dropped"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"], size: [system: "not-a-system", value: "9"]]]),
                schemaWithDefinitions()) == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION with an invalid REQUIRED nested field cascades: nested record drops, optional parent survives without it"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"], size: [system: "US"]]]),
                schemaWithDefinitions()) == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION value that is not a Map at all is dropped"() {
        expect:
        AttributeValueFilter.filter(g([footwear: "not a record"]), schemaWithDefinitions()) == [:]
    }

    def "an unknown key nested inside a DEFINITION record is silently dropped"() {
        expect:
        AttributeValueFilter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2", extraJunk: "typo"]]]), schemaWithDefinitions()) ==
                g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION_LIST with all elements valid keeps every element"() {
        expect:
        AttributeValueFilter.filter(g([rackets: [[value: "Astrox 88D Pro"], [id: "eq_9", value: "Thruster Ryuga II"]]]),
                schemaWithDefinitions()) == g([rackets: [[value: "Astrox 88D Pro"], [id: "eq_9", value: "Thruster Ryuga II"]]])
    }

    def "a DEFINITION_LIST drops a malformed element but keeps the rest"() {
        expect:
        AttributeValueFilter.filter(g([rackets: [[value: "Astrox 88D Pro"], [id: "eq_9"], "not even a record"]]),
                schemaWithDefinitions()) == g([rackets: [[value: "Astrox 88D Pro"]]])
    }

    def "an empty DEFINITION_LIST is kept - the one way this attribute type is cleared"() {
        expect:
        AttributeValueFilter.filter(g([rackets: []]), schemaWithDefinitions()) == g([rackets: []])
    }

    def "a DEFINITION_LIST value that is not a List at all is dropped entirely"() {
        expect:
        AttributeValueFilter.filter(g([rackets: [value: "not a list"]]), schemaWithDefinitions()) == [:]
    }

    def "a DEFINITION_LIST where every element is malformed still stores the (now empty) list, not a drop"() {
        expect:
        AttributeValueFilter.filter(g([rackets: ["junk", 42]]), schemaWithDefinitions()) == g([rackets: []])
    }

    def "a DEFINITION_LIST at exactly the 10-item cap is kept in full"() {
        given:
        def items = (1..10).collect { [value: "Racket ${it}" as String] }

        expect:
        AttributeValueFilter.filter(g([rackets: items]), schemaWithDefinitions()) == g([rackets: items])
    }

    def "a DEFINITION_LIST over the 10-item cap is dropped in full, not truncated to 10"() {
        given:
        def items = (1..11).collect { [value: "Racket ${it}" as String] }

        expect:
        AttributeValueFilter.filter(g([rackets: items]), schemaWithDefinitions()) == [:]
    }

    def "the cap gates on the SUBMITTED count, not the surviving count"() {
        expect:
        AttributeValueFilter.filter(g([rackets: (1..100).collect { "junk" }]), schemaWithDefinitions()) == [:]
    }

    // ---- filter, NUMBER / BOOLEAN ----

    def "a valid number (integer or decimal) and a valid boolean survive"() {
        expect:
        AttributeValueFilter.filter(g([tension: 27, weight: 88.5, strung: true]), schemaWithNumberAndBoolean()) ==
                g([tension: 27, weight: 88.5, strung: true])
    }

    @Unroll
    def "a value of the wrong shape for NUMBER/BOOLEAN is dropped, not rejected: #description"() {
        expect:
        AttributeValueFilter.filter(g(attributes), schemaWithNumberAndBoolean()) == [:]

        where:
        description                       | attributes
        "NUMBER sent as a numeric string" | [tension: "27"]
        "NUMBER sent as a boolean"        | [tension: true]
        "BOOLEAN sent as 1"               | [strung: 1]
        "BOOLEAN sent as \"true\""        | [strung: "true"]
    }

    @Unroll
    def "a NUMBER outside its inclusive bounds is dropped, on a bound is kept: #description"() {
        expect:
        AttributeValueFilter.filter(g([tension: value]), schemaWithNumberAndBoolean()) == g(expected)

        where:
        description | value | expected
        "below min" | 14.9  | [:]
        "at min"    | 15    | [tension: 15]
        "at max"    | 35    | [tension: 35]
        "above max" | 35.1  | [:]
    }

    def "an unbounded NUMBER accepts any finite value"() {
        expect:
        AttributeValueFilter.filter(g([weight: -5, tension: 20]), schemaWithNumberAndBoolean()) == g([weight: -5, tension: 20])
    }

    def "NUMBER and BOOLEAN as definition fields follow the required/optional record cascade"() {
        expect:
        AttributeValueFilter.filter(g([racket: [tension: 100, strung: true]]), schemaWithNumberAndBoolean()) == [:]
    }

    def "a definition record with a valid NUMBER and an invalid optional BOOLEAN keeps the record without that field"() {
        expect:
        AttributeValueFilter.filter(g([racket: [tension: 27, strung: "yes"]]), schemaWithNumberAndBoolean()) ==
                g([racket: [tension: 27]])
    }

    // ---- retainDefined ----

    def "retainDefined drops a stored key the schema no longer defines"() {
        expect:
        AttributeValueFilter.retainDefined(g([racket: "Yonex", legacyKey: "written before"]), schema()) == g([racket: "Yonex"])
    }

    def "retainDefined keeps a value under an isAvailable:false attribute verbatim, without re-validating"() {
        expect:
        AttributeValueFilter.retainDefined(g([racket: 42]), schema(true, false)) == g([racket: 42])
    }

    def "retainDefined keeps a value under an isAvailable:false group verbatim"() {
        expect:
        AttributeValueFilter.retainDefined(g([racket: 42]), schema(false, true)) == g([racket: 42])
    }

    def "retainDefined drops a live key whose stored value is no longer valid for its type"() {
        expect:
        AttributeValueFilter.retainDefined(g([racket: 42]), schema()) == [:]
    }

    def "retainDefined strips an undeclared nested field from a still-valid DEFINITION record"() {
        expect:
        AttributeValueFilter.retainDefined(g([footwear: [shoe: [value: "Aerus"], size: [system: "US", value: "9"], width: "wide"]]),
                schemaWithDefinitions()) == g([footwear: [shoe: [value: "Aerus"], size: [system: "US", value: "9"]]])
    }

    def "retainDefined drops a DEFINITION record that no longer satisfies its definition"() {
        expect:
        AttributeValueFilter.retainDefined(g([footwear: [size: [system: "US", value: "9"]]]), schemaWithDefinitions()) == [:]
    }

    def "retainDefined re-filters a stored DEFINITION_LIST - drops a malformed element and an undeclared nested field"() {
        expect:
        AttributeValueFilter.retainDefined(g([rackets: [[value: "Astrox 88D", brand: "Yonex"], [id: "eq_2"]]]),
                schemaWithDefinitions()) == g([rackets: [[value: "Astrox 88D"]]])
    }

    def "retainDefined keeps a DEFINITION_LIST that re-filters down to empty rather than dropping the key"() {
        expect:
        AttributeValueFilter.retainDefined(g([rackets: [[id: "eq_1"], [id: "eq_2"]]]), schemaWithDefinitions()) == g([rackets: []])
    }

    def "retainDefined drops a stored NUMBER now outside a tightened min/max"() {
        expect:
        AttributeValueFilter.retainDefined(g([tension: 100]), schemaWithNumberAndBoolean()) == [:]
    }

    def "retainDefined drops everything when there is no schema"() {
        expect:
        AttributeValueFilter.retainDefined(g([racket: "Yonex"]), null).isEmpty()
    }

    def "retainDefined returns an empty map for a null or empty stored map"() {
        expect:
        AttributeValueFilter.retainDefined(g(null), schema()).isEmpty()
        AttributeValueFilter.retainDefined(g([:]), schema()).isEmpty()
    }

    // ---- nested groups, path keys, full-depth cascade ----

    def "a value at a nested path survives when its whole ancestor chain is available"() {
        expect:
        AttributeValueFilter.filter(["gear/rackets/tension": "27"], nestedSchema(true, true)) == ["gear/rackets/tension": "27"]
    }

    @Unroll
    def "an unavailable ANCESTOR group hides a deeply nested leaf marked available (#description)"() {
        expect:
        AttributeValueFilter.filter(["gear/rackets/tension": "27"], nestedSchema(gearAvailable, racketsAvailable)).isEmpty()

        where:
        description             | gearAvailable | racketsAvailable
        "grandparent group off" | false         | true
        "parent sub-group off"  | true          | false
    }

    def "a bare pre-nesting key no longer resolves once the schema is nested — it is dropped"() {
        expect:
        AttributeValueFilter.filter([tension: "27"], nestedSchema()).isEmpty()
    }

    def "retainDefined keeps a nested-path value under an isAvailable:false ancestor group verbatim"() {
        expect:
        AttributeValueFilter.retainDefined(["gear/rackets/tension": 42], nestedSchema(false, true)) == ["gear/rackets/tension": 42]
    }

    def "retainDefined prunes a nested-path value whose leaf the schema no longer defines"() {
        expect:
        AttributeValueFilter.retainDefined(["gear/rackets/tension": "27", "gear/rackets/gone": "x"], nestedSchema()) ==
                ["gear/rackets/tension": "27"]
    }
}
