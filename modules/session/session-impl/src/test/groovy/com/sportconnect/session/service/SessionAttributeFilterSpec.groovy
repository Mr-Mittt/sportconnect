package com.sportconnect.session.service

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
 * SESSION-23: the lenient, replace-semantics half of session-attribute validation. Every case
 * asserts that something unacceptable is <em>dropped</em> rather than throwing — a session
 * create/update must not fail because a client sent a stale or malformed attribute. The one thing
 * this class must never do is throw, so the absence of {@code thrown()} anywhere below is the point.
 *
 * <p>A near-clone of {@code sport-impl}'s {@code ProfileAttributeFilterSpec}, minus its
 * {@code retainDefined} half (the session filter is write-only) and plus an explicit
 * replace-semantics case. The two collapse under sport {@code A23} / common {@code C5}.
 */
class SessionAttributeFilterSpec extends Specification {

    @Subject
    SessionAttributeFilter filter = new SessionAttributeFilter()

    /**
     * Every leaf in these schemas is rooted at the group {@code match}, so this prefixes each
     * top-level key of a submitted / expected map with {@code "match/"}. {@code null} passes through
     * so the "null request" cases still exercise that branch.
     */
    private static Map<String, Object> m(Map<String, Object> bare) {
        bare == null ? null : bare.collectEntries { k, v -> [("match/" + k).toString(), v] }
    }

    private static SportAttributeSchema schema(boolean groupAvailable = true, boolean ballsAvailable = true) {
        SportAttributeSchema.builder()
                .groups([
                        SportAttributeGroup.builder()
                                .key("match").label(["en": "Match"]).isAvailable(groupAvailable)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("note").label(["en": "Note"])
                                                .type(SportAttributeType.STRING)
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("ballsProvided").label(["en": "Balls provided?"])
                                                .type(SportAttributeType.BOOLEAN)
                                                .isAvailable(ballsAvailable).build(),
                                        SportAttributeDefinition.builder()
                                                .key("level").label(["en": "Level"])
                                                .type(SportAttributeType.ENUM)
                                                .options([new SportAttributeOption("casual", ["en": "Casual"]),
                                                          new SportAttributeOption("competitive", ["en": "Competitive"])])
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("courts").label(["en": "Courts"])
                                                .type(SportAttributeType.NUMBER).min(1.0d).max(8.0d)
                                                .isAvailable(true).build()
                                ]).build()
                ]).build()
    }

    def "a valid value for each type survives"() {
        when:
        def result = filter.filter(m([note: "Bring water", ballsProvided: true, level: "casual", courts: 2]), schema())

        then:
        result == m([note: "Bring water", ballsProvided: true, level: "casual", courts: 2])
    }

    def "an unknown key is dropped, and the rest of the write still goes through"() {
        when:
        def result = filter.filter(m([note: "hi", nonsense: "typo"]), schema())

        then:
        result == m([note: "hi"])
    }

    def "a value invalid for its type is dropped rather than rejected: #description"() {
        when:
        def result = filter.filter(m(attributes), schema())

        then:
        noExceptionThrown()
        result == m(expected)

        where:
        description                    | attributes                    | expected
        "enum value not an option"     | [level: "pro"]                | [:]
        "boolean sent as a string"     | [ballsProvided: "yes"]        | [:]
        "string sent as a number"      | [note: 42]                    | [:]
        "number below its min"         | [courts: 0]                   | [:]
        "number above its max"         | [courts: 9]                   | [:]
        "null value"                   | [note: null]                  | [:]
    }

    def "a number exactly on a bound is kept"() {
        expect:
        filter.filter(m([courts: 1]), schema()) == m([courts: 1])
        filter.filter(m([courts: 8]), schema()) == m([courts: 8])
    }

    def "a write targeting an unavailable attribute is dropped"() {
        when:
        def result = filter.filter(m([note: "hi", ballsProvided: true]), schema(true, false))

        then:
        result == m([note: "hi"])
    }

    def "an unavailable group hides its whole subtree, even for children still marked available"() {
        expect:
        filter.filter(m([note: "hi", ballsProvided: true]), schema(false, true)).isEmpty()
    }

    def "everything is dropped when the sport has no session schema at all"() {
        expect:
        filter.filter(m([note: "hi"]), null).isEmpty()
    }

    def "a null or empty request yields an empty map"() {
        expect:
        filter.filter(m(null), schema()).isEmpty()
        filter.filter(m([:]), schema()).isEmpty()
    }

    def "replace semantics: the result is exactly the accepted subset, nothing is carried over or merged"() {
        when: "a mix of one valid, one switched-off, one unknown, one wrong-typed"
        def result = filter.filter(
                m([note: "keep me", ballsProvided: true, unknown: "x", courts: "not-a-number"]),
                schema(true, false))

        then:
        result == m([note: "keep me"])
    }

    def "iteration order of the surviving entries follows the request"() {
        when:
        def result = filter.filter(m([courts: 2, note: "b", level: "casual"]), schema())

        then:
        new ArrayList<>(result.keySet()) == ["match/courts", "match/note", "match/level"]
    }

    // --- own DEFINITION node (A17 allows event-only record attributes) ---

    private static SportAttributeSchema schemaWithDefinition() {
        def contact = SportAttributeDefinitionType.builder().name("Contact").fields([
                SportAttributeField.builder().key("name").label(["en": "name"])
                        .type(SportAttributeType.STRING).isRequired(true).build(),
                SportAttributeField.builder().key("phone").label(["en": "phone"])
                        .type(SportAttributeType.STRING).isRequired(false).build()
        ]).build()

        SportAttributeSchema.builder()
                .definitions([contact])
                .groups([
                        SportAttributeGroup.builder()
                                .key("match").label(["en": "Match"]).isAvailable(true)
                                .attributes([
                                        SportAttributeDefinition.builder()
                                                .key("organiser").label(["en": "Organiser"])
                                                .type(SportAttributeType.DEFINITION).definitionRef("Contact")
                                                .isAvailable(true).build(),
                                        SportAttributeDefinition.builder()
                                                .key("refs").label(["en": "Referees"])
                                                .type(SportAttributeType.DEFINITION_LIST).definitionRef("Contact")
                                                .isAvailable(true).build()
                                ]).build()
                ]).build()
    }

    def "a DEFINITION value with its required field is kept; an undeclared nested field is stripped"() {
        when:
        def result = filter.filter(m([organiser: [name: "Sam", phone: "123", junk: "x"]]), schemaWithDefinition())

        then:
        result == m([organiser: [name: "Sam", phone: "123"]])
    }

    def "a DEFINITION missing its required field is dropped whole"() {
        expect:
        filter.filter(m([organiser: [phone: "123"]]), schemaWithDefinition()) == m([:])
    }

    def "a DEFINITION_LIST drops malformed elements but keeps the good ones; an empty result list is stored"() {
        expect:
        filter.filter(m([refs: [[name: "A"], [phone: "no-name"], "junk"]]), schemaWithDefinition()) == m([refs: [[name: "A"]]])
        filter.filter(m([refs: [[phone: "no-name"]]]), schemaWithDefinition()) == m([refs: []])
    }

    def "a DEFINITION_LIST over the 10-item cap is dropped in full, not truncated"() {
        when:
        def items = (1..11).collect { [name: "Ref ${it}" as String] }

        then:
        filter.filter(m([refs: items]), schemaWithDefinition()) == m([:])
    }

    def "a DEFINITION_LIST at exactly the 10-item cap is kept in full"() {
        when:
        def items = (1..10).collect { [name: "Ref ${it}" as String] }

        then:
        filter.filter(m([refs: items]), schemaWithDefinition()) == m([refs: items])
    }

    // --- nested groups / path keys (A19 v3) ---

    private static SportAttributeSchema nestedSchema(boolean outerAvailable = true, boolean innerAvailable = true) {
        SportAttributeSchema.builder().groups([
                SportAttributeGroup.builder()
                        .key("match").label(["en": "Match"]).isAvailable(outerAvailable)
                        .groups([
                                SportAttributeGroup.builder()
                                        .key("format").label(["en": "Format"]).isAvailable(innerAvailable)
                                        .attributes([
                                                SportAttributeDefinition.builder()
                                                        .key("sets").label(["en": "Sets"])
                                                        .type(SportAttributeType.STRING)
                                                        .isAvailable(true).build()
                                        ]).build()
                        ]).build()
        ]).build()
    }

    def "a value at a nested path survives when its whole ancestor chain is available"() {
        expect:
        filter.filter(["match/format/sets": "3"], nestedSchema(true, true)) == ["match/format/sets": "3"]
    }

    def "an unavailable ancestor group hides a deeply nested leaf even when the leaf is marked available: #description"() {
        expect:
        filter.filter(["match/format/sets": "3"], nestedSchema(outer, inner)).isEmpty()

        where:
        description              | outer | inner
        "grandparent group off"  | false | true
        "parent sub-group off"   | true  | false
    }
}
