package com.sportconnect.sport.service

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

class SessionAttributeSchemaResolverSpec extends Specification {

    SessionAttributeSchemaExpander expander = new SessionAttributeSchemaExpander()

    @Subject
    SessionAttributeSchemaResolver resolver =
            new SessionAttributeSchemaResolver(expander, new SportAttributeSchemaLabelResolver())

    private static final Locale EN = Locale.forLanguageTag("en")
    private static final Locale VI = Locale.forLanguageTag("vi")

    private static SessionAttributeSchema sessionSchema(List<SessionAttributeGroup> groups,
                                                        List<SportAttributeDefinitionType> definitions = null) {
        SessionAttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale("en").build()
    }

    private static SessionAttributeGroup sGroup(String key, List<SessionAttributeNode> attributes,
                                                List<SessionAttributeGroup> groups = null) {
        SessionAttributeGroup.builder()
                .key(key).label(["en": key, "vi": key + "_vi"]).isAvailable(true).attributes(attributes).groups(groups).build()
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

    private static findAttr(schema, String key) {
        for (g in schema.groups) {
            def hit = findInGroup(g, key)
            if (hit != null) return hit
        }
        null
    }

    private static findInGroup(g, String key) {
        for (a in (g.attributes ?: [])) {
            if (a.key == key) return a
        }
        for (sub in (g.groups ?: [])) {
            def hit = findInGroup(sub, key)
            if (hit != null) return hit
        }
        null
    }

    def "a #ref inherits type, options and definitionRef from the profile attribute"() {
        given:
        def profile = profileSchema([
                pGroup("gear", [
                        SportAttributeDefinition.builder()
                                .key("shuttleSpeed").label(["en": "Shuttle speed"]).type(SportAttributeType.ENUM)
                                .options([new SportAttributeOption("fast", ["en": "Fast"]),
                                          new SportAttributeOption("slow", ["en": "Slow"])])
                                .isAvailable(true).build()
                ])
        ])
        def session = sessionSchema([sGroup("setup", [SessionAttributeNode.builder().ref("gear/shuttleSpeed").build()])])

        when:
        def resolved = resolver.resolve(session, profile, EN)

        then:
        def node = findAttr(resolved, "shuttleSpeed")
        node.type == SportAttributeType.ENUM
        node.options*.value == ["fast", "slow"]
        node.prefillable
        node.prefillKey == "gear/shuttleSpeed"
    }

    def "an absent label override keeps the profile label; a present one wins"() {
        given:
        def profile = profileSchema([
                pGroup("gear", [
                        SportAttributeDefinition.builder()
                                .key("tension").label(["en": "Tension", "vi": "Muc cang"])
                                .type(SportAttributeType.NUMBER).isAvailable(true).build()
                ])
        ])
        def inherited = SessionAttributeNode.builder().ref("gear/tension").build()
        def overridden = SessionAttributeNode.builder().ref("gear/tension").label(["en": "String tension"]).build()

        expect:
        findAttr(resolver.resolve(sessionSchema([sGroup("a", [inherited])]), profile, EN), "tension").label == "Tension"

        and:
        findAttr(resolver.resolve(sessionSchema([sGroup("a", [overridden])]), profile, EN), "tension").label == "String tension"
    }

    def "own nodes are not marked prefillable"() {
        given:
        def session = sessionSchema([sGroup("setup", [
                SessionAttributeNode.builder().key("mode").label(["en": "Mode"]).type(SportAttributeType.STRING).build()
        ])])

        when:
        def resolved = resolver.resolve(session, profileSchema([]), EN)

        then:
        def node = findAttr(resolved, "mode")
        node.prefillable == null
        node.prefillKey == null
    }

    def "a #ref whose profile target has since been removed is dropped from the resolved output"() {
        given:
        def session = sessionSchema([sGroup("setup", [
                SessionAttributeNode.builder().ref("gear/gone").build(),
                SessionAttributeNode.builder().key("mode").label(["en": "Mode"]).type(SportAttributeType.STRING).build()
        ])])

        when:
        def resolved = resolver.resolve(session, profileSchema([pGroup("gear", [])]), EN)

        then:
        findAttr(resolved, "gone") == null
        findAttr(resolved, "mode") != null
    }

    def "a #ref whose profile target has since been disabled is dropped"() {
        given:
        def profile = profileSchema([pGroup("gear", [
                SportAttributeDefinition.builder().key("tension").label(["en": "Tension"])
                        .type(SportAttributeType.NUMBER).isAvailable(false).build()
        ])])
        def session = sessionSchema([sGroup("setup", [SessionAttributeNode.builder().ref("gear/tension").build()])])

        when:
        def resolved = resolver.resolve(session, profile, EN)

        then:
        findAttr(resolved, "tension") == null
    }

    def "nested session groups resolve recursively and the deep #ref is marked with its profile path"() {
        given:
        def profile = profileSchema([pGroup("gear", [], true, [
                pGroup("rackets", [SportAttributeDefinition.builder().key("tension").label(["en": "Tension"])
                                           .type(SportAttributeType.NUMBER).isAvailable(true).build()])
        ])])
        def session = sessionSchema([sGroup("outer", [], [
                sGroup("inner", [SessionAttributeNode.builder().ref("gear/rackets/tension").build()])
        ])])

        when:
        def resolved = resolver.resolve(session, profile, EN)

        then:
        def node = findAttr(resolved, "tension")
        node.prefillable
        node.prefillKey == "gear/rackets/tension"
    }

    def "the expanded doc merges the session-local registry with a profile definition a #ref pulls in"() {
        given:
        def profile = profileSchema([
                pGroup("gear", [SportAttributeDefinition.builder().key("rackets").label(["en": "Rackets"])
                                        .type(SportAttributeType.DEFINITION_LIST).definitionRef("Reference").isAvailable(true).build()])
        ], [SportAttributeDefinitionType.builder().name("Reference")
                    .fields([SportAttributeField.builder().key("value").label(["en": "Value"]).type(SportAttributeType.STRING).isRequired(true).build()])
                    .build()])
        def sessionRegistry = [SportAttributeDefinitionType.builder().name("Prize")
                                       .fields([SportAttributeField.builder().key("name").label(["en": "Name"]).type(SportAttributeType.STRING).isRequired(true).build()])
                                       .build()]
        def session = sessionSchema([sGroup("setup", [SessionAttributeNode.builder().ref("gear/rackets").build()])], sessionRegistry)

        when:
        def expanded = expander.expand(session, profile)

        then:
        expanded.schema().definitions*.name.toSet() == ["Prize", "Reference"] as Set
        // no #ref nodes survive expansion — every leaf is a plain SportAttributeDefinition
        expanded.schema().groups[0].attributes[0].key == "rackets"
        expanded.schema().groups[0].attributes[0].definitionRef == "Reference"
        expanded.prefillKeyByPath() == ["setup/rackets": "gear/rackets"]
    }

    def "an own DEFINITION node whose session-local definition is gone is dropped by the expander"() {
        given: "session node references 'Prize' but the registry does not declare it"
        def session = sessionSchema([sGroup("setup", [
                SessionAttributeNode.builder().key("prize").label(["en": "Prize"])
                        .type(SportAttributeType.DEFINITION).definitionRef("Prize").build(),
                SessionAttributeNode.builder().key("mode").label(["en": "Mode"]).type(SportAttributeType.STRING).build()
        ])])

        when:
        def expanded = expander.expand(session, profileSchema([]))

        then:
        expanded.schema().groups[0].attributes*.key == ["mode"]
    }

    def "a null session schema resolves to null"() {
        expect:
        resolver.resolve(null, profileSchema([]), EN) == null
        expander.expand(null, profileSchema([])) == null
    }

    def "labels resolve for the caller locale"() {
        given:
        def profile = profileSchema([pGroup("gear", [
                SportAttributeDefinition.builder().key("tension").label(["en": "Tension", "vi": "Muc cang luoi"])
                        .type(SportAttributeType.NUMBER).isAvailable(true).build()
        ])])
        def session = sessionSchema([sGroup("setup", [SessionAttributeNode.builder().ref("gear/tension").build()])])

        expect:
        findAttr(resolver.resolve(session, profile, VI), "tension").label == "Muc cang luoi"
    }
}
