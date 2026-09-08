package com.sportconnect.common.attributes.path

import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.node.StringAttribute
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C7: verbatim port of sport {@code SchemaPaths} — flatten the nested group tree to {@code /}-paths
 * and apply the {@code isAvailable} cascade at full depth (parent wins).
 */
class AttributePathsSpec extends Specification {

    private static StringAttribute attr(String key, Boolean available = true) {
        StringAttribute.builder().key(key).label([en: key]).isAvailable(available).build()
    }

    private static AttributeGroup group(String key, Boolean available, List attributes, List<AttributeGroup> groups = null) {
        AttributeGroup.builder().key(key).label([en: key]).isAvailable(available).attributes(attributes).groups(groups).build()
    }

    private static AttributeSchema schema(List<AttributeGroup> groups) {
        AttributeSchema.builder().groups(groups).defaultLocale("en").build()
    }

    def "a null schema flattens to an empty map"() {
        expect:
        AttributePaths.definedByPath(null).isEmpty()
        AttributePaths.availableByPath(null).isEmpty()
    }

    def "leaves are keyed by their full slash-separated path from the root"() {
        given:
        def s = schema([
                group("gear", true, [attr("racket")], [group("rackets", true, [attr("tension")])]),
                group("play", true, [attr("style")])
        ])

        expect:
        AttributePaths.definedByPath(s).keySet() == ["gear/racket", "gear/rackets/tension", "play/style"] as Set
    }

    def "the same leaf key under two branches yields two distinct paths"() {
        given:
        def s = schema([group("a", true, [attr("x")]), group("b", true, [attr("x")])])

        expect:
        AttributePaths.definedByPath(s).keySet() == ["a/x", "b/x"] as Set
    }

    @Unroll
    def "the isAvailable cascade runs at full depth, parent wins: #description"() {
        given:
        def s = schema([
                group("gear", gearAvailable, [], [
                        group("rackets", racketsAvailable, [attr("tension", leafAvailable)])
                ])
        ])

        expect:
        AttributePaths.definedByPath(s)["gear/rackets/tension"].live() == expectedLive
        AttributePaths.availableByPath(s).containsKey("gear/rackets/tension") == expectedLive

        where:
        description                       | gearAvailable | racketsAvailable | leafAvailable || expectedLive
        "all available"                   | true          | true             | true          || true
        "grandparent off"                 | false         | true             | true          || false
        "parent off"                      | true          | false            | true          || false
        "leaf off"                        | true          | true             | false         || false
        "leaf on but ancestor off"        | false         | true             | true          || false
    }

    def "definedByPath keeps a soft-deleted leaf (live=false); availableByPath drops it"() {
        given:
        def s = schema([group("gear", true, [attr("racket", true), attr("grip", false)])])

        expect:
        AttributePaths.definedByPath(s).keySet() == ["gear/racket", "gear/grip"] as Set
        AttributePaths.definedByPath(s)["gear/grip"].live() == false
        AttributePaths.availableByPath(s).keySet() == ["gear/racket"] as Set
    }

    def "a null isAvailable reads as available"() {
        given:
        def s = schema([group("gear", null, [attr("racket", null)])])

        expect:
        AttributePaths.availableByPath(s).containsKey("gear/racket")
    }

    def "the DefinedAttribute carries the node itself"() {
        given:
        def s = schema([group("gear", true, [attr("racket")])])

        expect:
        AttributePaths.definedByPath(s)["gear/racket"].node().getKey() == "racket"
    }
}
