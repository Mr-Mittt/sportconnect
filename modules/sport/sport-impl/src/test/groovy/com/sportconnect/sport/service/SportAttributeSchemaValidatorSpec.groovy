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
                                                      String searchScope = null) {
        SportAttributeDefinition.builder()
                .key(key)
                .label(key)
                .type(type)
                .options(options)
                .isAvailable(true)
                .order(1)
                .defaultValue(defaultValue)
                .definitionRef(definitionRef)
                .searchScope(searchScope)
                .build()
    }

    private static SportAttributeSchema schemaOf(List<SportAttributeGroup> groups,
                                                  List<SportAttributeDefinitionType> definitions = null) {
        SportAttributeSchema.builder().definitions(definitions).groups(groups).build()
    }

    private static SportAttributeGroup group(String key, List<SportAttributeDefinition> attributes) {
        SportAttributeGroup.builder()
                .key(key).label(key).isAvailable(true).order(1).attributes(attributes).build()
    }

    private static SportAttributeField field(String key, SportAttributeType type,
                                              List<SportAttributeOption> options = null,
                                              String definitionRef = null,
                                              boolean isRequired = false) {
        SportAttributeField.builder()
                .key(key).label(key).type(type).options(options)
                .definitionRef(definitionRef).isRequired(isRequired).order(1).build()
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
                                [new SportAttributeOption("feather", "Feather"),
                                 new SportAttributeOption("nylon", "Nylon")], "nylon")
                ]),
                group("play_style", [
                        attribute("preferred_shots", SportAttributeType.LIST,
                                [new SportAttributeOption("smash", "Smash"),
                                 new SportAttributeOption("drop", "Drop")], ["smash"])
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
                [new SportAttributeOption("a", "A"), new SportAttributeOption("a", "A again")])])])

        when:
        validator.validate(schema)

        then:
        thrown(BadRequestException)
    }

    def "a STRING attribute carrying options is rejected"() {
        given: "almost certainly meant to be an ENUM - rejecting beats silently ignoring the options"
        def schema = schemaOf([group("gear", [attribute("racket", SportAttributeType.STRING,
                [new SportAttributeOption("a", "A")])])])

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
        "ENUM default not an option"    | SportAttributeType.ENUM | [new SportAttributeOption("nylon", "Nylon")]   | "plastic"
        "ENUM default not a string"     | SportAttributeType.ENUM | [new SportAttributeOption("nylon", "Nylon")]   | 42
        "LIST default not a list"       | SportAttributeType.LIST | [new SportAttributeOption("smash", "Smash")]   | "smash"
        "LIST default element unknown"  | SportAttributeType.LIST | [new SportAttributeOption("smash", "Smash")]   | ["drop"]
        "LIST default over the 10-item cap" | SportAttributeType.LIST | [new SportAttributeOption("smash", "Smash")] | (1..11).collect { "smash" }
        "STRING default not a string"   | SportAttributeType.STRING | null                                         | 42
    }

    def "a defaultValue LIST at exactly the 10-item cap is accepted"() {
        given:
        def schema = schemaOf([group("gear", [
                attribute("shots", SportAttributeType.LIST, [new SportAttributeOption("smash", "Smash")],
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
                SportAttributeDefinition.builder().key("racket").label("Racket").isAvailable(true).build()
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
                    .tap { it.label = "L" * 60 }
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
                                [new SportAttributeOption("US", "US")], null, true),
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
                        SportAttributeField.builder().key("value").label("value").build()
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
                        [new SportAttributeOption("a", "A")], null, "Shoe")])
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
}
