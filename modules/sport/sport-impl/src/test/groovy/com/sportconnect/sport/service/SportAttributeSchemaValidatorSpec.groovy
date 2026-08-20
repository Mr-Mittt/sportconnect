package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeOption
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import spock.lang.Specification
import spock.lang.Subject

/**
 * A9: the strict half of the asymmetric validation — every rule that must reject an admin-supplied
 * schema document, plus the valid document that must survive them all.
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
                                                      Object defaultValue = null) {
        SportAttributeDefinition.builder()
                .key(key)
                .label(key)
                .type(type)
                .options(options)
                .isAvailable(true)
                .order(1)
                .defaultValue(defaultValue)
                .build()
    }

    private static SportAttributeSchema schemaOf(List<SportAttributeGroup> groups) {
        SportAttributeSchema.builder().version(1).groups(groups).build()
    }

    private static SportAttributeGroup group(String key, List<SportAttributeDefinition> attributes) {
        SportAttributeGroup.builder()
                .key(key).label(key).isAvailable(true).order(1).attributes(attributes).build()
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

    def "a document with no version is rejected"() {
        when:
        validator.validate(SportAttributeSchema.builder().groups([]).build())

        then:
        thrown(BadRequestException)
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
        "STRING default not a string"   | SportAttributeType.STRING | null                                         | 42
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
}
