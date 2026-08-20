package com.sportconnect.sport.service

import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeOption
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import spock.lang.Specification
import spock.lang.Subject

/**
 * A9: the lenient half of the asymmetric validation. Every case here asserts that something
 * unacceptable is <em>dropped</em> rather than throwing — the product decision was that a profile
 * save must not fail because a client sent a stale or malformed attribute.
 *
 * <p>The one thing this class must never do is throw, so the absence of {@code thrown()} anywhere
 * below is the point, not an omission.
 */
class ProfileAttributeFilterSpec extends Specification {

    @Subject
    ProfileAttributeFilter filter = new ProfileAttributeFilter()

    private static SportAttributeSchema schema(boolean groupAvailable = true, boolean racketAvailable = true) {
        SportAttributeSchema.builder()
                .version(1)
                .groups([
                        SportAttributeGroup.builder()
                                .key("gear").label("Gear").isAvailable(groupAvailable).order(1)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("racket").label("Racket")
                                                .type(SportAttributeType.STRING)
                                                .isAvailable(racketAvailable).order(1).build(),
                                        SportAttributeDefinition.builder()
                                                .key("shuttlecock").label("Shuttlecock")
                                                .type(SportAttributeType.ENUM)
                                                .options([new SportAttributeOption("feather", "Feather"),
                                                          new SportAttributeOption("nylon", "Nylon")])
                                                .isAvailable(true).order(2).build(),
                                        SportAttributeDefinition.builder()
                                                .key("shots").label("Shots")
                                                .type(SportAttributeType.LIST)
                                                .options([new SportAttributeOption("smash", "Smash"),
                                                          new SportAttributeOption("drop", "Drop")])
                                                .isAvailable(true).order(3).build()
                                ]).build()
                ]).build()
    }

    def "a valid value for each type survives"() {
        when:
        def result = filter.filter(
                [racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]], schema())

        then:
        result == [racket: "Yonex", shuttlecock: "nylon", shots: ["smash", "drop"]]
    }

    def "an unknown key is dropped, and the rest of the write still goes through"() {
        when:
        def result = filter.filter([racket: "Yonex", rackettt: "typo"], schema())

        then:
        result == [racket: "Yonex"]
    }

    def "a value invalid for its type is dropped rather than rejected: #description"() {
        when:
        def result = filter.filter(attributes, schema())

        then:
        noExceptionThrown()
        result == expected

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
        def result = filter.filter([shots: []], schema())

        then:
        result == [shots: []]
    }

    def "a write targeting an unavailable attribute is dropped"() {
        when:
        def result = filter.filter([racket: "Yonex", shuttlecock: "nylon"],
                schema(true, false))

        then:
        result == [shuttlecock: "nylon"]
    }

    def "an unavailable group hides its whole subtree, even for children still marked available"() {
        given: "racket is isAvailable:true but its parent group is off - parent state must win"
        def result = filter.filter([racket: "Yonex", shuttlecock: "nylon"], schema(false, true))

        expect:
        result.isEmpty()
    }

    def "everything is dropped when the sport has no schema at all"() {
        when:
        def result = filter.filter([racket: "Yonex"], null)

        then:
        result.isEmpty()
    }

    def "a null or empty request yields an empty map"() {
        expect:
        filter.filter(null, schema()).isEmpty()
        filter.filter([:], schema()).isEmpty()
    }

    def "an attribute omitting isAvailable is treated as available"() {
        given: "a document that simply does not mention the flag reads as available to an admin"
        def s = SportAttributeSchema.builder().version(1).groups([
                SportAttributeGroup.builder().key("gear").label("Gear").order(1)
                        .attributes([SportAttributeDefinition.builder()
                                             .key("racket").label("Racket")
                                             .type(SportAttributeType.STRING).order(1).build()])
                        .build()
        ]).build()

        when:
        def result = filter.filter([racket: "Yonex"], s)

        then:
        result == [racket: "Yonex"]
    }
}
