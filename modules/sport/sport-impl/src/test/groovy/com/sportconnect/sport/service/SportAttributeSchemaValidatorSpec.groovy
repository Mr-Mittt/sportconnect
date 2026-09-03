package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
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
 * A9: the strict half of the asymmetric validation — every rule that must reject an admin-supplied
 * schema document, plus the valid document that must survive them all. Extended by v2/A12 for the
 * {@code definitions} registry and {@code DEFINITION}/{@code DEFINITION_LIST} type kinds.
 *
 * <p>These rules are what keep the stored profile map coherent, so each one gets its own case
 * rather than being bundled into a single "invalid document" test: a bundled test passes as soon as
 * any one rule fires, which would let the others silently rot.
 */
class SportAttributeSchemaValidatorSpec extends Specification {

    @Subject
    SportAttributeSchemaValidator validator = new SportAttributeSchemaValidator(new ObjectMapper())

    private static SportAttributeDefinition attribute(String key, SportAttributeType type,
                                                      List<SportAttributeOption> options = null,
                                                      Object defaultValue = null,
                                                      String definitionRef = null,
                                                      String searchScope = null,
                                                      Double min = null,
                                                      Double max = null) {
        SportAttributeDefinition.builder()
                .key(key)
                .label(["en": key])
                .type(type)
                .options(options)
                .isAvailable(true)
                .order(1)
                .defaultValue(defaultValue)
                .definitionRef(definitionRef)
                .searchScope(searchScope)
                .min(min)
                .max(max)
                .build()
    }

    private static SportAttributeSchema schemaOf(List<SportAttributeGroup> groups,
                                                  List<SportAttributeDefinitionType> definitions = null,
                                                  String defaultLocale = "en") {
        SportAttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale(defaultLocale).build()
    }

    private static SportAttributeGroup group(String key, List<SportAttributeDefinition> attributes) {
        SportAttributeGroup.builder()
                .key(key).label(["en": key]).isAvailable(true).order(1).attributes(attributes).build()
    }

    private static SportAttributeField field(String key, SportAttributeType type,
                                              List<SportAttributeOption> options = null,
                                              String definitionRef = null,
                                              boolean isRequired = false,
                                              Double min = null,
                                              Double max = null) {
        SportAttributeField.builder()
                .key(key).label(["en": key]).type(type).options(options)
                .definitionRef(definitionRef).isRequired(isRequired).order(1)
                .min(min).max(max).build()
    }

    private static SportAttributeDefinitionType definitionType(String name, List<SportAttributeField> fields) {
        SportAttributeDefinitionType.builder().name(name).fields(fields).build()
    }

    /** A minimal, valid v2 registry: {@code Reference{id?, value}} — the {@code Reference}
     *  entity-link shape used throughout the design doc's examples. Referenced only by top-level
     *  attributes (outer position), so it is a convenient building block that never itself triggers
     *  the depth-2/primitives-only rule. */
    private static List<SportAttributeDefinitionType> referenceRegistry() {
        [definitionType("Reference", [
                field("id", SportAttributeType.STRING, null, null, false),
                field("value", SportAttributeType.STRING, null, null, true)
        ])]
    }

    def "a valid document passes"() {
        given:
        def schema = schemaOf([
                group("gear", [
                        attribute("racket", SportAttributeType.STRING),
                        attribute("shuttlecock", SportAttributeType.ENUM,
                                [new SportAttributeOption("feather", ["en": "Feather"]),
                                 new SportAttributeOption("nylon", ["en": "Nylon"])], "nylon")
                ]),
                group("play_style", [
                        attribute("preferred_shots", SportAttributeType.LIST,
                                [new SportAttributeOption("smash", ["en": "Smash"]),
                                 new SportAttributeOption("drop", ["en": "Drop"])], ["smash"])
                ])
        ])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a null document is valid and means the sport offers no attributes"() {
        when:
        validator.validate(null)

        then:
        noExceptionThrown()
    }

    def "duplicate leaf keys are rejected even across different groups"() {
        given: "the invariant that matters most - the stored profile map is flat, so groups do not namespace keys"
        def schema = schemaOf([
                group("gear", [attribute("racket", SportAttributeType.STRING)]),
                group("other", [attribute("racket", SportAttributeType.STRING)])
        ])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("racket")
    }

    def "duplicate group keys are rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("racket", SportAttributeType.STRING)]),
                group("gear", [attribute("grip", SportAttributeType.STRING)])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "#type without options is rejected"() {
        given:
        def schema = schemaOf([group("gear", [attribute("choice", type, options)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        type                     | options
        SportAttributeType.ENUM  | null
        SportAttributeType.ENUM  | []
        SportAttributeType.LIST  | null
        SportAttributeType.LIST  | []
    }

    def "duplicate option values are rejected"() {
        given:
        def schema = schemaOf([group("gear", [attribute("choice", SportAttributeType.ENUM,
                [new SportAttributeOption("a", ["en": "A"]), new SportAttributeOption("a", ["en": "A again"])])])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a STRING attribute carrying options is rejected"() {
        given: "almost certainly meant to be an ENUM - rejecting beats silently ignoring the options"
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING,
                [new SportAttributeOption("a", ["en": "A"])])])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a defaultValue invalid for its own type is rejected: #description"() {
        given:
        def schema = schemaOf([group("gear", [attribute("choice", type, options, defaultValue)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        description                     | type                    | options                                        | defaultValue
        "ENUM default not an option"    | SportAttributeType.ENUM | [new SportAttributeOption("nylon", ["en": "Nylon"])]   | "plastic"
        "ENUM default not a string"     | SportAttributeType.ENUM | [new SportAttributeOption("nylon", ["en": "Nylon"])]   | 42
        "LIST default not a list"       | SportAttributeType.LIST | [new SportAttributeOption("smash", ["en": "Smash"])]   | "smash"
        "LIST default element unknown"  | SportAttributeType.LIST | [new SportAttributeOption("smash", ["en": "Smash"])]   | ["drop"]
        "LIST default over the 10-item cap" | SportAttributeType.LIST | [new SportAttributeOption("smash", ["en": "Smash"])] | (1..11).collect { "smash" }
        "STRING default not a string"   | SportAttributeType.STRING | null                                         | 42
    }

    def "a defaultValue LIST at exactly the 10-item cap is accepted"() {
        given:
        def schema = schemaOf([group("gear", [
                attribute("shots", SportAttributeType.LIST, [new SportAttributeOption("smash", ["en": "Smash"])],
                        (1..10).collect { "smash" })
        ])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "keys not matching the key pattern are rejected: #key"() {
        given:
        def schema = schemaOf([group("gear", [attribute(key, SportAttributeType.STRING)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        key << ["Racket", "1racket", "racket-name", "racket name", "_racket", ""]
    }

    def "an attribute with no type is rejected"() {
        given:
        def schema = schemaOf([group("gear", [
                SportAttributeDefinition.builder().key("racket").label(["en": "Racket"]).isAvailable(true).build()
        ])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a document over the size cap is rejected"() {
        given: "many attributes with long labels, enough to exceed 16KB once serialised"
        def attributes = (1..400).collect {
            attribute("attr_${it}" as String, SportAttributeType.STRING)
                    .tap { it.label = ["en": "L" * 60] }
        }
        def schema = schemaOf([group("gear", attributes)])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("16KB")
    }

    // --- v2 / A12: the definitions registry, DEFINITION / DEFINITION_LIST ---

    def "a valid v2 document with definitions, DEFINITION and DEFINITION_LIST passes"() {
        given: "Shoe{shoe: Reference, size?: ShoeSize} — Shoe is outer-only, Reference/ShoeSize are inner and primitive-only"
        def definitions = [
                definitionType("Reference", [
                        field("id", SportAttributeType.STRING, null, null, false),
                        field("value", SportAttributeType.STRING, null, null, true)
                ]),
                definitionType("ShoeSize", [
                        field("system", SportAttributeType.ENUM,
                                [new SportAttributeOption("US", ["en": "US"])], null, true),
                        field("value", SportAttributeType.STRING, null, null, true)
                ]),
                definitionType("Shoe", [
                        field("shoe", SportAttributeType.DEFINITION, null, "Reference", true),
                        field("size", SportAttributeType.DEFINITION, null, "ShoeSize", false)
                ])
        ]
        def schema = schemaOf([
                group("gear", [
                        attribute("rackets", SportAttributeType.DEFINITION_LIST, null, null, "Reference",
                                "equipment.racket.badminton"),
                        attribute("footwear", SportAttributeType.DEFINITION, null, null, "Shoe")
                ])
        ], definitions)

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a document declaring an empty definitions list is unaffected — nothing depends on it being non-empty"() {
        given:
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING)])], [])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "definition names not matching the pattern are rejected: #name"() {
        given:
        def schema = schemaOf([group("gear", [])], [definitionType(name, [])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        name << ["reference", "Reference-Type", "1Reference", "", null]
    }

    def "duplicate definition names are rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", []), definitionType("Reference", [])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "duplicate field keys within one definition are rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", [
                        field("value", SportAttributeType.STRING),
                        field("value", SportAttributeType.STRING)
                ])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "the same field key is allowed across two different definitions"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", [field("value", SportAttributeType.STRING)]),
                definitionType("ShoeSize", [field("value", SportAttributeType.STRING)])
        ])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a definition field with no type is rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", [
                        SportAttributeField.builder().key("value").label(["en": "value"]).build()
                ])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a definition field of type DEFINITION_LIST is rejected"() {
        given: "a definition field may only be a primitive or a single DEFINITION, never a repeating list"
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", [field("value", SportAttributeType.STRING)]),
                definitionType("Shoe", [field("shoes", SportAttributeType.DEFINITION_LIST, null, "Reference")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION field without definitionRef is rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Shoe", [field("shoe", SportAttributeType.DEFINITION)])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION field with an unresolved definitionRef is rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Shoe", [field("shoe", SportAttributeType.DEFINITION, null, "NoSuchDefinition")])
        ])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("NoSuchDefinition")
    }

    def "a non-DEFINITION field declaring definitionRef is rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", []),
                definitionType("Shoe", [field("name", SportAttributeType.STRING, null, "Reference")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a definition referenced by another definition's field must contain only primitive fields"() {
        given: "Reference is inner (referenced by Shoe.shoe) but itself has a DEFINITION field - depth violation"
        def schema = schemaOf([group("gear", [])], [
                definitionType("Inner", [field("value", SportAttributeType.STRING)]),
                definitionType("Reference", [field("nested", SportAttributeType.DEFINITION, null, "Inner")]),
                definitionType("Shoe", [field("shoe", SportAttributeType.DEFINITION, null, "Reference")])
        ])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Reference")
    }

    def "a self-referencing definition is rejected"() {
        given: "A references itself - A is inner-position (referenced by its own field) but has a DEFINITION field"
        def schema = schemaOf([group("gear", [])], [
                definitionType("Node", [field("child", SportAttributeType.DEFINITION, null, "Node")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a cycle between two definitions is rejected"() {
        given: "A -> B -> A: B is inner (referenced by A) so B's fields must be primitive, but B references A"
        def schema = schemaOf([group("gear", [])], [
                definitionType("A", [field("b", SportAttributeType.DEFINITION, null, "B")]),
                definitionType("B", [field("a", SportAttributeType.DEFINITION, null, "A")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a definition referenced only by a top-level attribute (outer position) may itself have DEFINITION fields"() {
        given: "Shoe is never referenced by another definition, so it may hold DEFINITION-typed fields"
        def schema = schemaOf([
                group("gear", [attribute("footwear", SportAttributeType.DEFINITION, null, null, "Shoe")])
        ], [
                definitionType("Reference", [field("value", SportAttributeType.STRING)]),
                definitionType("Shoe", [field("shoe", SportAttributeType.DEFINITION, null, "Reference")])
        ])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "an unreferenced definition is allowed"() {
        given: "declared but never used by any attribute or field - incremental editing must not be punished"
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING)])],
                [definitionType("Unused", [field("value", SportAttributeType.STRING)])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a DEFINITION attribute declaring options is rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("footwear", SportAttributeType.DEFINITION,
                        [new SportAttributeOption("a", ["en": "A"])], null, "Shoe")])
        ], [definitionType("Shoe", [])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION attribute declaring a defaultValue is rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("footwear", SportAttributeType.DEFINITION, null, [value: "x"], "Shoe")])
        ], [definitionType("Shoe", [])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION_LIST attribute without definitionRef is rejected"() {
        given:
        def schema = schemaOf([group("gear", [attribute("rackets", SportAttributeType.DEFINITION_LIST)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION_LIST attribute with an unresolved definitionRef is rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("rackets", SportAttributeType.DEFINITION_LIST, null, null, "NoSuchDefinition")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a non-DEFINITION attribute declaring definitionRef is rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("racket", SportAttributeType.STRING, null, null, "Reference")])
        ], referenceRegistry())

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a non-DEFINITION attribute declaring searchScope is rejected"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("racket", SportAttributeType.STRING, null, null, null, "equipment.racket")])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a DEFINITION_LIST attribute may declare searchScope"() {
        given:
        def schema = schemaOf([
                group("gear", [attribute("rackets", SportAttributeType.DEFINITION_LIST, null, null,
                        "Reference", "equipment.racket.badminton")])
        ], referenceRegistry())

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    // --- A13: localized labels ---

    def "a schema with no defaultLocale is rejected"() {
        given:
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING)])], null, null)

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    def "a schema whose defaultLocale is not a well-formed BCP 47 tag is rejected: #defaultLocale"() {
        given:
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING)])], null, defaultLocale)

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        defaultLocale << ["vi_VN", "1", "", "-en"]
    }

    def "a node whose label is missing the schema's defaultLocale entry is rejected"() {
        given: "the label carries only 'vi', but the schema's defaultLocale is 'en'"
        def schema = schemaOf([group("gear", [
                SportAttributeDefinition.builder().key("racket").label(["vi": "Vợt"])
                        .type(SportAttributeType.STRING).isAvailable(true).order(1).build()
        ])])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("racket")
        e.message.contains("defaultLocale")
    }

    def "a node with no label at all is rejected"() {
        given:
        def schema = schemaOf([group("gear", [
                SportAttributeDefinition.builder().key("racket")
                        .type(SportAttributeType.STRING).isAvailable(true).order(1).build()
        ])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a node whose label carries a malformed locale key is rejected, even alongside a valid defaultLocale entry: #locale"() {
        given:
        def schema = schemaOf([group("gear", [
                SportAttributeDefinition.builder().key("racket").label(["en": "Racket", (locale): "x"])
                        .type(SportAttributeType.STRING).isAvailable(true).order(1).build()
        ])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        locale << ["vi_VN", "1", "-en"]
    }

    def "an option's label is checked the same way as every other labeled node"() {
        given:
        def schema = schemaOf([group("gear", [attribute("choice", SportAttributeType.ENUM,
                [SportAttributeOption.builder().value("a").label(["vi": "A"]).build()])])])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    def "a definition field's label is checked the same way as every other labeled node"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Reference", [
                        SportAttributeField.builder().key("value").label(["vi": "Giá trị"])
                                .type(SportAttributeType.STRING).build()
                ])
        ])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("defaultLocale")
    }

    def "a document with multiple locales on every label, all covering defaultLocale, passes"() {
        given:
        def schema = schemaOf([group("gear", [
                SportAttributeDefinition.builder().key("racket").label(["en": "Racket", "vi": "Vợt"])
                        .type(SportAttributeType.ENUM)
                        .options([SportAttributeOption.builder().value("a")
                                          .label(["en": "A", "vi": "A"]).build()])
                        .isAvailable(true).order(1).build()
        ])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    // --- A16: NUMBER and BOOLEAN ---

    def "a document with NUMBER (bounded and unbounded) and BOOLEAN attributes passes"() {
        given:
        def schema = schemaOf([group("gear", [
                attribute("tension", SportAttributeType.NUMBER, null, 27.0, null, null, 15.0, 35.0),
                attribute("weight", SportAttributeType.NUMBER),
                attribute("strung", SportAttributeType.BOOLEAN, null, true)
        ])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a NUMBER defaultValue is accepted whether the literal is an integer or a decimal: #description"() {
        given:
        def schema = schemaOf([group("gear", [attribute("tension", SportAttributeType.NUMBER, null, defaultValue)])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()

        where:
        description        | defaultValue
        "integer literal"  | 27
        "long literal"     | 27L
        "decimal literal"  | 27.5d
    }

    def "#type carrying options is rejected"() {
        given:
        def schema = schemaOf([group("gear", [attribute("x", type,
                [new SportAttributeOption("a", ["en": "A"])])])])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains(type.toString())

        where:
        type << [SportAttributeType.NUMBER, SportAttributeType.BOOLEAN]
    }

    def "a defaultValue invalid for NUMBER/BOOLEAN is rejected: #description"() {
        given:
        def schema = schemaOf([group("gear", [attribute("x", type, null, defaultValue, null, null, min, max)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        description                         | type                       | defaultValue | min   | max
        "NUMBER default is a numeric string"| SportAttributeType.NUMBER  | "27"         | null  | null
        "NUMBER default is a boolean"       | SportAttributeType.NUMBER  | true         | null  | null
        "NUMBER default below min"          | SportAttributeType.NUMBER  | 10.0         | 15.0  | 35.0
        "NUMBER default above max"          | SportAttributeType.NUMBER  | 40.0         | 15.0  | 35.0
        "BOOLEAN default is a string"       | SportAttributeType.BOOLEAN | "true"       | null  | null
        "BOOLEAN default is a number"       | SportAttributeType.BOOLEAN | 1            | null  | null
    }

    def "a NUMBER defaultValue exactly on an inclusive bound is accepted: #description"() {
        given:
        def schema = schemaOf([group("gear", [
                attribute("tension", SportAttributeType.NUMBER, null, defaultValue, null, null, 15.0, 35.0)
        ])])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()

        where:
        description | defaultValue
        "at min"    | 15.0
        "at max"    | 35.0
    }

    def "a NUMBER attribute whose min is greater than its max is rejected"() {
        given:
        def schema = schemaOf([group("gear", [
                attribute("tension", SportAttributeType.NUMBER, null, null, null, null, 35.0, 15.0)
        ])])

        when:
        validator.validate(schema)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("min")
    }

    def "min/max declared on a non-NUMBER attribute is rejected: #type"() {
        given:
        def schema = schemaOf([group("gear", [attribute("x", type, options, null, null, null, 1.0, 10.0)])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)

        where:
        type                       | options
        SportAttributeType.STRING  | null
        SportAttributeType.BOOLEAN | null
        SportAttributeType.ENUM    | [new SportAttributeOption("a", ["en": "A"])]
    }

    def "NUMBER and BOOLEAN are legal as definition fields, including in an inner-position definition"() {
        given: "Spec{tension: NUMBER, strung: BOOLEAN} is referenced by Racket.spec (inner position)"
        def schema = schemaOf([
                group("gear", [attribute("racket", SportAttributeType.DEFINITION, null, null, "Racket")])
        ], [
                definitionType("Spec", [
                        field("tension", SportAttributeType.NUMBER, null, null, false, 15.0, 35.0),
                        field("strung", SportAttributeType.BOOLEAN)
                ]),
                definitionType("Racket", [field("spec", SportAttributeType.DEFINITION, null, "Spec", true)])
        ])

        when:
        validator.validate(schema)

        then:
        noExceptionThrown()
    }

    def "a definition field carrying min/max while not NUMBER is rejected"() {
        given:
        def schema = schemaOf([group("gear", [])], [
                definitionType("Spec", [field("name", SportAttributeType.STRING, null, null, false, 1.0, 10.0)])
        ])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }
}
