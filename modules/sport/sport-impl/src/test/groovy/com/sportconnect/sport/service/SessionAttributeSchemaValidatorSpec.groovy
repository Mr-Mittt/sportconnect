package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.sport.api.dto.SessionAttributeGroup
import com.sportconnect.sport.api.dto.SessionAttributeNode
import com.sportconnect.sport.api.dto.SessionAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType
import com.sportconnect.sport.api.dto.SportAttributeField
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeOption
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import spock.lang.Specification
import spock.lang.Subject

class SessionAttributeSchemaValidatorSpec extends Specification {

    @Subject
    SessionAttributeSchemaValidator validator = new SessionAttributeSchemaValidator(new ObjectMapper())

    // ---- builders ----

    private static SessionAttributeSchema sessionSchema(List<SessionAttributeGroup> groups,
                                                        List<SportAttributeDefinitionType> definitions = null,
                                                        String defaultLocale = "en") {
        SessionAttributeSchema.builder()
                .definitions(definitions).groups(groups).defaultLocale(defaultLocale).build()
    }

    private static SessionAttributeGroup sGroup(String key, List<SessionAttributeNode> attributes,
                                                List<SessionAttributeGroup> groups = null) {
        SessionAttributeGroup.builder()
                .key(key).label(["en": key]).isAvailable(true).attributes(attributes).groups(groups).build()
    }

    private static SessionAttributeNode ref(String path, Map<String, String> label = null) {
        SessionAttributeNode.builder().ref(path).label(label).build()
    }

    private static SessionAttributeNode own(String key, SportAttributeType type = SportAttributeType.STRING) {
        SessionAttributeNode.builder().key(key).label(["en": key]).type(type).build()
    }

    private static SportAttributeSchema profileSchema(List<SportAttributeGroup> groups,
                                                      List<SportAttributeDefinitionType> definitions = null) {
        SportAttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale("en").build()
    }

    private static SportAttributeGroup pGroup(String key, List<SportAttributeDefinition> attributes,
                                              boolean available = true, List<SportAttributeGroup> groups = null) {
        SportAttributeGroup.builder()
                .key(key).label(["en": key]).isAvailable(available).attributes(attributes).groups(groups).build()
    }

    private static SportAttributeDefinition pAttr(String key, SportAttributeType type = SportAttributeType.STRING,
                                                  boolean available = true, String definitionRef = null) {
        SportAttributeDefinition.builder()
                .key(key).label(["en": key]).type(type).isAvailable(available).definitionRef(definitionRef).build()
    }

    private static SportAttributeDefinitionType defType(String name, List<SportAttributeField> fields) {
        SportAttributeDefinitionType.builder().name(name).fields(fields).build()
    }

    private static SportAttributeField pField(String key, SportAttributeType type = SportAttributeType.STRING) {
        SportAttributeField.builder().key(key).label(["en": key]).type(type).isRequired(false).build()
    }

    private static SportAttributeSchema badmintonProfile() {
        profileSchema([
                pGroup("general", [pAttr("handedness")]),
                pGroup("gear", [pAttr("shoeSize")], true, [
                        pGroup("rackets", [pAttr("tension", SportAttributeType.NUMBER)])
                ])
        ])
    }

    // ---- tests ----

    def "a null session schema is valid"() {
        expect:
        validator.validate(null, badmintonProfile())
    }

    def "an own node plus a #ref to a live profile attribute passes"() {
        given:
        def schema = sessionSchema([
                sGroup("setup", [
                        own("ballsProvided", SportAttributeType.BOOLEAN),
                        ref("gear/rackets/tension")
                ])
        ])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        noExceptionThrown()
    }

    def "a #ref to a path that does not exist in the profile schema is rejected"() {
        given:
        def schema = sessionSchema([sGroup("setup", [ref("gear/rackets/nope")])])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("gear/rackets/nope")
    }

    def "a #ref to an unavailable profile attribute is rejected"() {
        given:
        def profile = profileSchema([
                pGroup("gear", [pAttr("tension", SportAttributeType.NUMBER, false)])
        ])
        def schema = sessionSchema([sGroup("setup", [ref("gear/tension")])])

        when:
        validator.validate(schema, profile)

        then:
        thrown(BadRequestException)
    }

    def "a #ref to an attribute under an unavailable profile group is rejected"() {
        given:
        def profile = profileSchema([
                pGroup("gear", [pAttr("tension", SportAttributeType.NUMBER)], false)
        ])
        def schema = sessionSchema([sGroup("setup", [ref("gear/tension")])])

        when:
        validator.validate(schema, profile)

        then:
        thrown(BadRequestException)
    }

    def "a #ref against a null profile schema is a dangling reference"() {
        given:
        def schema = sessionSchema([sGroup("setup", [ref("gear/rackets/tension")])])

        when:
        validator.validate(schema, null)

        then:
        thrown(BadRequestException)
    }

    def "a #ref node carrying any field other than label is rejected"() {
        given:
        def node = SessionAttributeNode.builder()
                .ref("gear/rackets/tension").type(SportAttributeType.STRING).build()
        def schema = sessionSchema([sGroup("setup", [node])])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("must not declare any field other than label")
    }

    def "two #refs to the same profile path are rejected"() {
        given:
        def schema = sessionSchema([
                sGroup("a", [ref("gear/rackets/tension")]),
                sGroup("b", [ref("gear/rackets/tension")])
        ])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Duplicate #ref")
    }

    def "a #ref's last-segment key colliding with a sibling own node key is rejected"() {
        given: "own node 'tension' and #ref gear/rackets/tension share group 'setup'"
        def schema = sessionSchema([
                sGroup("setup", [own("tension", SportAttributeType.NUMBER), ref("gear/rackets/tension")])
        ])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Duplicate node key among siblings")
    }

    def "an own node with no type is rejected by the shared checks"() {
        given:
        def node = SessionAttributeNode.builder().key("mode").label(["en": "Mode"]).build()
        def schema = sessionSchema([sGroup("setup", [node])])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("must declare a type")
    }

    def "an own DEFINITION node whose definitionRef is not in the session-local registry is rejected"() {
        given:
        def node = SessionAttributeNode.builder()
                .key("prize").label(["en": "Prize"]).type(SportAttributeType.DEFINITION).definitionRef("Missing").build()
        def schema = sessionSchema([sGroup("setup", [node])])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        thrown(BadRequestException)
    }

    def "an own DEFINITION node resolving against the session-local registry passes"() {
        given:
        def registry = [defType("Prize", [pField("name"), pField("value")])]
        def node = SessionAttributeNode.builder()
                .key("prize").label(["en": "Prize"]).type(SportAttributeType.DEFINITION).definitionRef("Prize").build()
        def schema = sessionSchema([sGroup("setup", [node])], registry)

        when:
        validator.validate(schema, badmintonProfile())

        then:
        noExceptionThrown()
    }

    def "a session-local definition name colliding with one a #ref pulls in from the profile schema is rejected"() {
        given: "profile 'rackets' is a DEFINITION using profile definition 'Reference'; session declares its own 'Reference'"
        def profile = profileSchema([
                pGroup("gear", [pAttr("rackets", SportAttributeType.DEFINITION, true, "Reference")])
        ], [defType("Reference", [pField("value")])])
        def registry = [defType("Reference", [pField("name")])]
        def schema = sessionSchema([sGroup("setup", [ref("gear/rackets")])], registry)

        when:
        validator.validate(schema, profile)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("Reference")
    }

    def "a missing defaultLocale is rejected"() {
        given:
        def schema = sessionSchema([sGroup("setup", [own("mode")])], null, null)

        when:
        validator.validate(schema, badmintonProfile())

        then:
        thrown(BadRequestException)
    }

    def "sibling namespace is per parent - the same own key is legal under two different groups"() {
        given:
        def schema = sessionSchema([
                sGroup("a", [own("mode")]),
                sGroup("b", [own("mode")])
        ])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        noExceptionThrown()
    }

    def "nested session groups: a #ref and an own node deep in the tree pass"() {
        given:
        def schema = sessionSchema([
                sGroup("outer", [own("a")], [
                        sGroup("inner", [own("b"), ref("gear/rackets/tension")])
                ])
        ])

        when:
        validator.validate(schema, badmintonProfile())

        then:
        noExceptionThrown()
    }
}
