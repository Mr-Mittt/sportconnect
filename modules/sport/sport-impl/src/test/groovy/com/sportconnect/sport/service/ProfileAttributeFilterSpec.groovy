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
 * A9: the lenient half of the asymmetric validation. Every case here asserts that something
 * unacceptable is <em>dropped</em> rather than throwing — the product decision was that a profile
 * save must not fail because a client sent a stale or malformed attribute. Extended by v2/A12 for
 * {@code DEFINITION}/{@code DEFINITION_LIST} — the record-shaped values.
 *
 * <p>The one thing this class must never do is throw, so the absence of {@code thrown()} anywhere
 * below is the point, not an omission.
 */
class ProfileAttributeFilterSpec extends Specification {

    @Subject
    ProfileAttributeFilter filter = new ProfileAttributeFilter()

    /**
     * v3/A19: {@code UserSportProfile.attributes} is keyed by an attribute's full {@code /}-separated
     * path, not its bare leaf key. Every schema in this spec roots its attributes at the group
     * {@code gear}, so this prefixes each top-level key of a submitted / stored / expected map with
     * {@code "gear/"}. Nested record-field keys are values, not paths — left untouched. {@code null}
     * passes through so the "null request" cases still exercise that branch.
     */
    private static Map<String, Object> g(Map<String, Object> bare) {
        bare == null ? null : bare.collectEntries { k, v -> [("gear/" + k).toString(), v] }
    }

    private static SportAttributeSchema schema(boolean groupAvailable = true, boolean racketAvailable = true) {
        SportAttributeSchema.builder()
                .groups([
                        SportAttributeGroup.builder()
                                .key("gear").label(["en": "Gear"]).isAvailable(groupAvailable)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("racket").label(["en": "Racket"])
                                                .type(SportAttributeType.STRING)
                                                .isAvailable(racketAvailable).build(),
                                        SportAttributeDefinition.builder()
                                                .key("shuttlecock").label(["en": "Shuttlecock"])
                                                .type(SportAttributeType.ENUM)
                                                .options([new SportAttributeOption("feather", ["en": "Feather"]),
                                                          new SportAttributeOption("nylon", ["en": "Nylon"])])
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("shots").label(["en": "Shots"])
                                                .type(SportAttributeType.LIST)
                                                .options([new SportAttributeOption("smash", ["en": "Smash"]),
                                                          new SportAttributeOption("drop", ["en": "Drop"])])
                                                .isAvailable(true).build()
                                ]).build()
                ]).build()
    }

    def "a valid value for each type survives"() {
        when:
        def result = filter.filter(g([racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]]), schema())

        then:
        result == g([racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]])
    }

    def "an unknown key is dropped, and the rest of the write still goes through"() {
        when:
        def result = filter.filter(g([racket: "Yonex", rackettt: "typo"]), schema())

        then:
        result == g([racket: "Yonex"])
    }

    def "a value invalid for its type is dropped rather than rejected: #description"() {
        when:
        def result = filter.filter(g(attributes), schema())

        then:
        noExceptionThrown()
        result == g(expected)

        where:
        description                   | attributes                        | expected
        "enum value not an option"    | [shuttlecock: "plastic"]          | [:]
        "enum value not a string"     | [shuttlecock: 42]                 | [:]
        "list sent as a string"       | [shots: "smash"]                  | [:]
        "list element not an option"  | [shots: ["smash", "lob"]]         | [:]
        "string sent as a number"     | [racket: 42]                      | [:]
        "null value"                  | [racket: null]                    | [:]
    }

    def "an empty list is kept - it is how a multi-select is cleared without a delete-a-key path"() {
        when:
        def result = filter.filter(g([shots: []]), schema())

        then:
        result == g([shots: []])
    }

    def "a LIST value at exactly the 10-item cap is kept"() {
        when:
        def result = filter.filter(g([shots: (["smash", "drop"] * 5)]), schema())

        then:
        result == g([shots: (["smash", "drop"] * 5)])
    }

    def "a LIST value over the 10-item cap is dropped in full, not truncated"() {
        when: "11 items - one more than the cap - even though every element is itself a valid option"
        def result = filter.filter(g([shots: (["smash", "drop"] * 5) + ["smash"]]), schema())

        then:
        result == g([:])
    }

    def "a write targeting an unavailable attribute is dropped"() {
        when:
        def result = filter.filter(g([racket: "Yonex", shuttlecock: "nylon"]),
                schema(true, false))

        then:
        result == g([shuttlecock: "nylon"])
    }

    def "an unavailable group hides its whole subtree, even for children still marked available"() {
        given: "racket is isAvailable:true but its parent group is off - parent state must win"
        def result = filter.filter(g([racket: "Yonex", shuttlecock: "nylon"]), schema(false, true))

        expect:
        result.isEmpty()
    }

    def "everything is dropped when the sport has no schema at all"() {
        when:
        def result = filter.filter(g([racket: "Yonex"]), null)

        then:
        result.isEmpty()
    }

    def "a null or empty request yields an empty map"() {
        expect:
        filter.filter(g(null), schema()).isEmpty()
        filter.filter(g([:]), schema()).isEmpty()
    }

    def "an attribute omitting isAvailable is treated as available"() {
        given: "a document that simply does not mention the flag reads as available to an admin"
        def s = SportAttributeSchema.builder().groups([
                SportAttributeGroup.builder().key("gear").label(["en": "Gear"])
                        .attributes([SportAttributeDefinition.builder()
                                             .key("racket").label(["en": "Racket"])
                                             .type(SportAttributeType.STRING).build()])
                        .build()
        ]).build()

        when:
        def result = filter.filter(g([racket: "Yonex"]), s)

        then:
        result == g([racket: "Yonex"])
    }

    // --- v2 / A12: DEFINITION / DEFINITION_LIST ---

    /**
     * {@code Shoe{shoe: Reference(required), size: ShoeSize(optional)}}, with
     * {@code Reference{id?, value(required)}} and {@code ShoeSize{system(required), value(required)}}
     * — the same shape the v2 design doc uses throughout, plus a bare {@code Reference}-typed
     * {@code rackets: DEFINITION_LIST} attribute for the list-of-records cases.
     */
    private static SportAttributeSchema schemaWithDefinitions() {
        def reference = SportAttributeDefinitionType.builder().name("Reference").fields([
                SportAttributeField.builder().key("id").label(["en": "id"])
                        .type(SportAttributeType.STRING).isRequired(false).build(),
                SportAttributeField.builder().key("value").label(["en": "value"])
                        .type(SportAttributeType.STRING).isRequired(true).build()
        ]).build()
        def shoeSize = SportAttributeDefinitionType.builder().name("ShoeSize").fields([
                SportAttributeField.builder().key("system").label(["en": "system"])
                        .type(SportAttributeType.ENUM)
                        .options([new SportAttributeOption("US", ["en": "US"]), new SportAttributeOption("UK", ["en": "UK"])])
                        .isRequired(true).build(),
                SportAttributeField.builder().key("value").label(["en": "value"])
                        .type(SportAttributeType.STRING).isRequired(true).build()
        ]).build()
        def shoe = SportAttributeDefinitionType.builder().name("Shoe").fields([
                SportAttributeField.builder().key("shoe").label(["en": "shoe"])
                        .type(SportAttributeType.DEFINITION).definitionRef("Reference").isRequired(true).build(),
                SportAttributeField.builder().key("size").label(["en": "size"])
                        .type(SportAttributeType.DEFINITION).definitionRef("ShoeSize").isRequired(false).build()
        ]).build()

        SportAttributeSchema.builder()
                .definitions([reference, shoeSize, shoe])
                .groups([
                        SportAttributeGroup.builder()
                                .key("gear").label(["en": "Gear"]).isAvailable(true)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("rackets").label(["en": "Rackets"])
                                                .type(SportAttributeType.DEFINITION_LIST)
                                                .definitionRef("Reference")
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("footwear").label(["en": "Footwear"])
                                                .type(SportAttributeType.DEFINITION)
                                                .definitionRef("Shoe")
                                                .isAvailable(true).build()
                                ]).build()
                ]).build()
    }

    def "a DEFINITION value with all fields valid is kept in full"() {
        when:
        def result = filter.filter(g([footwear: [shoe: [id: "eq_1", value: "Yonex Aerus Z2"], size: [system: "US", value: "9"]]]),
                schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [id: "eq_1", value: "Yonex Aerus Z2"], size: [system: "US", value: "9"]]])
    }

    def "a DEFINITION value with only the required field present is kept, optional field just absent"() {
        when:
        def result = filter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"]]]), schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION with its required field missing is dropped entirely"() {
        when: "shoe.shoe is required, and here it's absent"
        def result = filter.filter(g([footwear: [size: [system: "US", value: "9"]]]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    def "a DEFINITION with an invalid OPTIONAL nested field is kept, that field alone is dropped"() {
        when: "shoe.size is optional; ShoeSize.system invalid drops the whole nested ShoeSize, size then just absent from Shoe"
        def result = filter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"], size: [system: "not-a-system", value: "9"]]]),
                schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION with an invalid REQUIRED nested field cascades: the nested record drops, and since it was optional the parent survives without it"() {
        when: "ShoeSize.value is required and missing, so the whole ShoeSize is invalid; size is optional in Shoe, so Shoe survives"
        def result = filter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2"], size: [system: "US"]]]),
                schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION value that is not a Map at all is dropped"() {
        when:
        def result = filter.filter(g([footwear: "not a record"]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    def "an unknown key nested inside a DEFINITION record is silently dropped, not stored"() {
        when:
        def result = filter.filter(g([footwear: [shoe: [value: "Yonex Aerus Z2", extraJunk: "typo"]]]), schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [value: "Yonex Aerus Z2"]]])
    }

    def "a DEFINITION_LIST with all elements valid keeps every element"() {
        when:
        def result = filter.filter(g([rackets: [[value: "Yonex Astrox 88D Pro"], [id: "eq_9", value: "Victor Thruster Ryuga II"]]]),
                schemaWithDefinitions())

        then:
        result == g([rackets: [[value: "Yonex Astrox 88D Pro"], [id: "eq_9", value: "Victor Thruster Ryuga II"]]])
    }

    def "a DEFINITION_LIST drops a malformed element but keeps the rest"() {
        when: "the second element has no value, which Reference requires"
        def result = filter.filter(g([rackets: [[value: "Yonex Astrox 88D Pro"], [id: "eq_9"], "not even a record"]]),
                schemaWithDefinitions())

        then:
        result == g([rackets: [[value: "Yonex Astrox 88D Pro"]]])
    }

    def "an empty DEFINITION_LIST is kept - it is the one way this attribute type can be cleared"() {
        when:
        def result = filter.filter(g([rackets: []]), schemaWithDefinitions())

        then:
        result == g([rackets: []])
    }

    def "a DEFINITION_LIST value that is not a List at all is dropped entirely"() {
        when:
        def result = filter.filter(g([rackets: [value: "not a list"]]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    def "a DEFINITION_LIST where every element is malformed still stores the (now empty) list, not a drop"() {
        when:
        def result = filter.filter(g([rackets: ["junk", 42]]), schemaWithDefinitions())

        then:
        result == g([rackets: []])
    }

    def "a DEFINITION_LIST at exactly the 10-item cap is kept in full"() {
        when:
        def items = (1..10).collect { [value: "Racket ${it}" as String] }
        def result = filter.filter(g([rackets: items]), schemaWithDefinitions())

        then:
        result == g([rackets: items])
    }

    def "a DEFINITION_LIST over the 10-item cap is dropped in full, not truncated to 10"() {
        when: "11 submitted items, every one of them individually well-formed"
        def items = (1..11).collect { [value: "Racket ${it}" as String] }
        def result = filter.filter(g([rackets: items]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    def "the cap gates on the SUBMITTED count, not the surviving count - a flood of junk past the cap is dropped in full"() {
        when: "100 malformed elements - if the cap checked survivors instead, this would slip through as an empty list"
        def result = filter.filter(g([rackets: (1..100).collect { "junk" }]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    // --- A16: NUMBER / BOOLEAN ---

    /**
     * {@code tension: NUMBER[15..35]}, {@code weight: NUMBER} (unbounded), {@code strung: BOOLEAN}
     * top-level, plus a {@code spec: DEFINITION} over {@code Spec{tension: NUMBER[15..35] required,
     * strung: BOOLEAN optional}} so the record cascade is exercised for the new types too.
     */
    private static SportAttributeSchema schemaWithNumberAndBoolean() {
        def spec = SportAttributeDefinitionType.builder().name("Spec").fields([
                SportAttributeField.builder().key("tension").label(["en": "Tension"])
                        .type(SportAttributeType.NUMBER).min(15.0d).max(35.0d).isRequired(true).build(),
                SportAttributeField.builder().key("strung").label(["en": "Strung"])
                        .type(SportAttributeType.BOOLEAN).isRequired(false).build()
        ]).build()

        SportAttributeSchema.builder()
                .definitions([spec])
                .groups([
                        SportAttributeGroup.builder()
                                .key("gear").label(["en": "Gear"]).isAvailable(true)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("tension").label(["en": "Tension"])
                                                .type(SportAttributeType.NUMBER).min(15.0d).max(35.0d)
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("weight").label(["en": "Weight"])
                                                .type(SportAttributeType.NUMBER)
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("strung").label(["en": "Strung"])
                                                .type(SportAttributeType.BOOLEAN)
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("racket").label(["en": "Racket"])
                                                .type(SportAttributeType.DEFINITION).definitionRef("Spec")
                                                .isAvailable(true).build()
                                ]).build()
                ]).build()
    }

    def "a valid number (integer or decimal) and a valid boolean survive"() {
        when:
        def result = filter.filter(g([tension: 27, weight: 88.5, strung: true]), schemaWithNumberAndBoolean())

        then:
        result == g([tension: 27, weight: 88.5, strung: true])
    }

    def "a value of the wrong shape for NUMBER/BOOLEAN is dropped, not rejected: #description"() {
        when:
        def result = filter.filter(g(attributes), schemaWithNumberAndBoolean())

        then:
        noExceptionThrown()
        result == g([:])

        where:
        description                     | attributes
        "NUMBER sent as a numeric string" | [tension: "27"]
        "NUMBER sent as a boolean"        | [tension: true]
        "BOOLEAN sent as 1"               | [strung: 1]
        "BOOLEAN sent as \"true\""        | [strung: "true"]
    }

    def "a NUMBER outside its inclusive bounds is dropped, but a value exactly on a bound is kept: #description"() {
        when:
        def result = filter.filter(g([tension: value]), schemaWithNumberAndBoolean())

        then:
        result == g(expected)

        where:
        description   | value | expected
        "below min"   | 14.9  | [:]
        "at min"      | 15    | [tension: 15]
        "at max"      | 35    | [tension: 35]
        "above max"   | 35.1  | [:]
    }

    def "an unbounded NUMBER accepts any finite value"() {
        when:
        def result = filter.filter(g([weight: -5, tension: 20]), schemaWithNumberAndBoolean())

        then:
        result == g([weight: -5, tension: 20])
    }

    def "NUMBER and BOOLEAN as definition fields follow the required/optional record cascade"() {
        when: "tension (required) is out of range -> the whole record drops; strung is optional"
        def result = filter.filter(g([
                racket: [tension: 100, strung: true]
        ]), schemaWithNumberAndBoolean())

        then:
        result == g([:])
    }

    def "a definition record with a valid NUMBER and an invalid optional BOOLEAN keeps the record without that field"() {
        when:
        def result = filter.filter(g([
                racket: [tension: 27, strung: "yes"]
        ]), schemaWithNumberAndBoolean())

        then:
        result == g([racket: [tension: 27]])
    }

    // --- A10 Part 2: retainDefined (re-filter of an already-stored map) ---

    def "retainDefined drops a stored key the schema no longer defines"() {
        when:
        def result = filter.retainDefined(g([racket: "Yonex", legacyKey: "written before A9"]), schema())

        then:
        result == g([racket: "Yonex"])
    }

    def "retainDefined keeps a value under an isAvailable:false attribute verbatim, without re-validating it"() {
        when: "racket is switched off; its stored value would be invalid for a STRING if re-checked"
        def result = filter.retainDefined(g([racket: 42]), schema(true, false))

        then:
        result == g([racket: 42])
    }

    def "retainDefined keeps a value under an isAvailable:false group verbatim"() {
        when:
        def result = filter.retainDefined(g([racket: 42]), schema(false, true))

        then:
        result == g([racket: 42])
    }

    def "retainDefined drops a live key whose stored value is no longer valid for its type"() {
        when: "racket is live, so 42 IS re-validated against STRING and fails"
        def result = filter.retainDefined(g([racket: 42]), schema())

        then:
        result == g([:])
    }

    def "retainDefined strips an undeclared nested field from a still-valid DEFINITION record"() {
        when: "Shoe declares shoe + size only; the stored record also carries width"
        def result = filter.retainDefined(g([footwear: [shoe: [value: "Yonex Aerus"], size: [system: "US", value: "9"], width: "wide"]]),
                schemaWithDefinitions())

        then:
        result == g([footwear: [shoe: [value: "Yonex Aerus"], size: [system: "US", value: "9"]]])
    }

    def "retainDefined drops a DEFINITION record that no longer satisfies its definition - the accepted 2b gap"() {
        when: "Shoe.shoe is required and the stored record lacks it"
        def result = filter.retainDefined(g([footwear: [size: [system: "US", value: "9"]]]), schemaWithDefinitions())

        then:
        result == g([:])
    }

    def "retainDefined re-filters a stored DEFINITION_LIST - drops a malformed element and an undeclared nested field"() {
        when: "one good element (with an undeclared 'brand'), one missing Reference's required 'value'"
        def result = filter.retainDefined(g([rackets: [[value: "Astrox 88D", brand: "Yonex"], [id: "eq_2"]]]),
                schemaWithDefinitions())

        then:
        result == g([rackets: [[value: "Astrox 88D"]]])
    }

    def "retainDefined keeps a DEFINITION_LIST that re-filters down to empty rather than dropping the key"() {
        when: "every stored element lacks Reference's required 'value'"
        def result = filter.retainDefined(g([rackets: [[id: "eq_1"], [id: "eq_2"]]]), schemaWithDefinitions())

        then:
        result == g([rackets: []])
    }

    def "retainDefined drops a stored NUMBER now outside a tightened min/max"() {
        when: "tension was stored as 27 when unbounded; the schema now bounds it to 15..35... 100 fails"
        def result = filter.retainDefined(g([tension: 100]), schemaWithNumberAndBoolean())

        then:
        result == g([:])
    }

    def "retainDefined drops everything when the sport has no schema"() {
        expect:
        filter.retainDefined(g([racket: "Yonex"]), null).isEmpty()
    }

    def "retainDefined returns an empty map for a null or empty stored map"() {
        expect:
        filter.retainDefined(g(null), schema()).isEmpty()
        filter.retainDefined(g([:]), schema()).isEmpty()
    }

    // --- v3 / A19: nested groups, path keys, full-depth isAvailable cascade ---

    /** {@code gear} (available: #gearAvailable) -> sub-group {@code rackets} (available: #racketsAvailable)
     *  -> attribute {@code tension: STRING} (always isAvailable:true). Exercises the full-depth cascade. */
    private static SportAttributeSchema nestedSchema(boolean gearAvailable = true, boolean racketsAvailable = true) {
        SportAttributeSchema.builder().groups([
                SportAttributeGroup.builder()
                        .key("gear").label(["en": "Gear"]).isAvailable(gearAvailable)
                        .groups([
                                SportAttributeGroup.builder()
                                        .key("rackets").label(["en": "Rackets"]).isAvailable(racketsAvailable)
                                        .attributes([
                                                SportAttributeDefinition.builder()
                                                        .key("tension").label(["en": "Tension"])
                                                        .type(SportAttributeType.STRING)
                                                        .isAvailable(true).build()
                                        ]).build()
                        ]).build()
        ]).build()
    }

    def "a value at a nested path survives when its whole ancestor chain is available"() {
        when:
        def result = filter.filter(["gear/rackets/tension": "27"], nestedSchema(true, true))

        then:
        result == ["gear/rackets/tension": "27"]
    }

    def "an unavailable ANCESTOR group hides a deeply nested leaf, even one marked available (cascade is full-depth): #description"() {
        when:
        def result = filter.filter(["gear/rackets/tension": "27"], nestedSchema(gearAvailable, racketsAvailable))

        then:
        result.isEmpty()

        where:
        description                    | gearAvailable | racketsAvailable
        "grandparent group off"        | false         | true
        "parent sub-group off"         | true          | false
    }

    def "a bare pre-v3 key no longer resolves once the schema is nested — it is dropped"() {
        when: "the value was stored as 'tension' before v3; the live schema only has 'gear/rackets/tension'"
        def result = filter.filter([tension: "27"], nestedSchema())

        then:
        result.isEmpty()
    }

    def "retainDefined keeps a nested-path value under an isAvailable:false ancestor group verbatim"() {
        when: "gear is switched off; the stored value would be invalid if re-checked, but a frozen value is kept"
        def result = filter.retainDefined(["gear/rackets/tension": 42], nestedSchema(false, true))

        then:
        result == ["gear/rackets/tension": 42]
    }

    def "retainDefined prunes a nested-path value whose leaf the schema no longer defines"() {
        when:
        def result = filter.retainDefined(
                ["gear/rackets/tension": "27", "gear/rackets/gone": "x"], nestedSchema())

        then:
        result == ["gear/rackets/tension": "27"]
    }
}
