package com.sportconnect.common.attributes.pair

import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.AttributeType
import com.sportconnect.common.attributes.Cardinality
import com.sportconnect.common.attributes.field.StringField
import com.sportconnect.common.attributes.node.AttributeNode
import com.sportconnect.common.attributes.node.DefinitionAttribute
import com.sportconnect.common.attributes.node.DefinitionListAttribute
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.ListAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.RefAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import com.sportconnect.common.attributes.resolved.ResolvedAttributeGroup
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

/**
 * C9: port of sport {@code SessionAttributeSchemaResolverSpec} (231 ln) onto the neutral sealed
 * model. Exercises {@link DerivedSchemaExpander} and {@link DerivedSchemaResolver} together, the way
 * the original did. Every outcome of the original is preserved (D11); added: the resolved
 * {@code #ref} node carries the <em>ref's</em> {@link Cardinality} (extraction plan D9), and
 * {@code prefillKey} names the base choice-list path.
 */
class DerivedSchemaResolverSpec extends Specification {

    @Subject
    DerivedSchemaResolver resolver = new DerivedSchemaResolver()

    private static final Locale EN = Locale.forLanguageTag("en")
    private static final Locale VI = Locale.forLanguageTag("vi")

    // ---- builders ----

    private static AttributeSchema derived(List<AttributeGroup> groups,
                                           List<AttributeDefinitionType> definitions = null) {
        AttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale("en").build()
    }

    private static AttributeGroup dGroup(String key, List<AttributeNode> attributes,
                                         List<AttributeGroup> groups = null) {
        AttributeGroup.builder()
                .key(key).label(["en": key, "vi": key + "_vi"]).isAvailable(true).attributes(attributes).groups(groups).build()
    }

    private static RefAttribute ref(String key, String path, Cardinality cardinality = Cardinality.SINGLE,
                                    Map<String, String> label = null) {
        RefAttribute.builder().key(key).ref(path).cardinality(cardinality).label(label).build()
    }

    private static AttributeSchema base(List<AttributeGroup> groups,
                                        List<AttributeDefinitionType> definitions = null) {
        AttributeSchema.builder().definitions(definitions).groups(groups).defaultLocale("en").build()
    }

    private static AttributeGroup bGroup(String key, List<AttributeNode> attributes,
                                         boolean available = true, List<AttributeGroup> groups = null) {
        AttributeGroup.builder()
                .key(key).label(["en": key]).isAvailable(available).attributes(attributes).groups(groups).build()
    }

    private static AttributeOption opt(String value, String label) {
        AttributeOption.builder().value(value).label(["en": label]).build()
    }

    private static findAttr(schema, String key) {
        for (g in schema.groups) {
            def hit = findInGroup(g, key)
            if (hit != null) return hit
        }
        null
    }

    private static findInGroup(ResolvedAttributeGroup g, String key) {
        for (a in (g.attributes ?: [])) {
            if (a.key == key) return a
        }
        for (sub in (g.groups ?: [])) {
            def hit = findInGroup(sub, key)
            if (hit != null) return hit
        }
        null
    }

    // ---- tests: ported from SessionAttributeSchemaResolverSpec ----

    def "a #ref inherits type, options and definitionRef from the base attribute and carries its cardinality"() {
        given:
        def baseSchema = base([
                bGroup("gear", [
                        EnumAttribute.builder()
                                .key("shuttleSpeed").label(["en": "Shuttle speed"])
                                .options([opt("fast", "Fast"), opt("slow", "Slow")])
                                .isAvailable(true).build()
                ])
        ])
        def d = derived([dGroup("setup", [ref("shuttleSpeed", "gear/shuttleSpeed", Cardinality.LIST)])])

        when:
        def resolved = resolver.resolve(baseSchema, d, EN)

        then:
        def node = findAttr(resolved, "shuttleSpeed")
        node.type == AttributeType.ENUM
        node.options*.value == ["fast", "slow"]
        node.prefillable
        node.prefillKey == "gear/shuttleSpeed"
        node.cardinality == Cardinality.LIST
    }

    def "an absent label override keeps the base label; a present one wins"() {
        given:
        def baseSchema = base([
                bGroup("gear", [
                        NumberAttribute.builder()
                                .key("tension").label(["en": "Tension", "vi": "Muc cang"])
                                .isAvailable(true).build()
                ])
        ])
        def inherited = ref("tension", "gear/tension")
        def overridden = ref("tension", "gear/tension", Cardinality.SINGLE, ["en": "String tension"])

        expect:
        findAttr(resolver.resolve(baseSchema, derived([dGroup("a", [inherited])]), EN), "tension").label == "Tension"

        and:
        findAttr(resolver.resolve(baseSchema, derived([dGroup("a", [overridden])]), EN), "tension").label == "String tension"
    }

    def "own nodes are not marked prefillable and carry no cardinality"() {
        given:
        def d = derived([dGroup("setup", [
                StringAttribute.builder().key("mode").label(["en": "Mode"]).isAvailable(true).build()
        ])])

        when:
        def resolved = resolver.resolve(base([]), d, EN)

        then:
        def node = findAttr(resolved, "mode")
        node.prefillable == null
        node.prefillKey == null
        node.cardinality == null
    }

    def "a #ref whose base target has since been removed is dropped from the resolved output"() {
        given:
        def d = derived([dGroup("setup", [
                ref("gone", "gear/gone"),
                StringAttribute.builder().key("mode").label(["en": "Mode"]).isAvailable(true).build()
        ])])

        when:
        def resolved = resolver.resolve(base([bGroup("gear", [])]), d, EN)

        then:
        findAttr(resolved, "gone") == null
        findAttr(resolved, "mode") != null
    }

    def "a #ref whose base target has since been disabled is dropped"() {
        given:
        def baseSchema = base([bGroup("gear", [
                NumberAttribute.builder().key("tension").label(["en": "Tension"]).isAvailable(false).build()
        ])])
        def d = derived([dGroup("setup", [ref("tension", "gear/tension")])])

        when:
        def resolved = resolver.resolve(baseSchema, d, EN)

        then:
        findAttr(resolved, "tension") == null
    }

    def "nested derived groups resolve recursively and the deep #ref is marked with its base path"() {
        given:
        def baseSchema = base([bGroup("gear", [], true, [
                bGroup("rackets", [NumberAttribute.builder().key("tension").label(["en": "Tension"]).isAvailable(true).build()])
        ])])
        def d = derived([dGroup("outer", [], [
                dGroup("inner", [ref("tension", "gear/rackets/tension")])
        ])])

        when:
        def resolved = resolver.resolve(baseSchema, d, EN)

        then:
        def node = findAttr(resolved, "tension")
        node.prefillable
        node.prefillKey == "gear/rackets/tension"
    }

    def "the expanded doc merges the derived-local registry with a base definition a #ref pulls in"() {
        given:
        def baseSchema = base([
                bGroup("gear", [DefinitionListAttribute.builder().key("rackets").label(["en": "Rackets"])
                                        .definitionRef("Reference").isAvailable(true).build()])
        ], [AttributeDefinitionType.builder().name("Reference")
                    .fields([StringField.builder().key("value").label(["en": "Value"]).isRequired(true).build()])
                    .build()])
        def derivedRegistry = [AttributeDefinitionType.builder().name("Prize")
                                       .fields([StringField.builder().key("name").label(["en": "Name"]).isRequired(true).build()])
                                       .build()]
        def d = derived([dGroup("setup", [ref("rackets", "gear/rackets", Cardinality.LIST)])], derivedRegistry)

        when:
        def expanded = DerivedSchemaExpander.expand(baseSchema, d)

        then:
        expanded.schema().definitions*.name.toSet() == ["Prize", "Reference"] as Set
        // no #ref nodes survive expansion — every leaf is a plain typed AttributeNode
        expanded.schema().groups[0].attributes[0].key == "rackets"
        expanded.schema().groups[0].attributes[0] instanceof DefinitionListAttribute
        expanded.schema().groups[0].attributes[0].definitionRef == "Reference"
        expanded.refExpansionsByPath().keySet() == ["setup/rackets"] as Set
        expanded.refExpansionsByPath()["setup/rackets"].basePath() == "gear/rackets"
        expanded.refExpansionsByPath()["setup/rackets"].cardinality() == Cardinality.LIST
    }

    def "an own DEFINITION node whose derived-local definition is gone is dropped by the expander"() {
        given: "derived node references 'Prize' but the registry does not declare it"
        def d = derived([dGroup("setup", [
                DefinitionAttribute.builder().key("prize").label(["en": "Prize"]).isAvailable(true).definitionRef("Prize").build(),
                StringAttribute.builder().key("mode").label(["en": "Mode"]).isAvailable(true).build()
        ])])

        when:
        def expanded = DerivedSchemaExpander.expand(base([]), d)

        then:
        expanded.schema().groups[0].attributes*.key == ["mode"]
    }

    def "a null derived schema resolves to null"() {
        expect:
        resolver.resolve(base([]), null, EN) == null
        DerivedSchemaExpander.expand(base([]), null) == null
    }

    def "labels resolve for the caller locale"() {
        given:
        def baseSchema = base([bGroup("gear", [
                NumberAttribute.builder().key("tension").label(["en": "Tension", "vi": "Muc cang luoi"]).isAvailable(true).build()
        ])])
        def d = derived([dGroup("setup", [ref("tension", "gear/tension")])])

        expect:
        findAttr(resolver.resolve(baseSchema, d, VI), "tension").label == "Muc cang luoi"
    }

    // ---- tests: new #ref cardinality contract (extraction plan D9) ----

    @Unroll
    def "the resolved ref node carries the ref cardinality independent of the base shape: #description"() {
        given:
        def baseSchema = base([bGroup("prefs", [
                EnumAttribute.builder().key("speed").label(["en": "Speed"]).isAvailable(true)
                        .options([opt("fast", "Fast"), opt("slow", "Slow")]).build(),
                ListAttribute.builder().key("surfaces").label(["en": "Surfaces"]).isAvailable(true)
                        .options([opt("wood", "Wood"), opt("mat", "Mat")]).build()
        ])])
        def d = derived([dGroup("setup", [ref("pick", "prefs/" + basePath, cardinality)])])

        when:
        def resolved = resolver.resolve(baseSchema, d, EN)

        then:
        def node = findAttr(resolved, "pick")
        node != null
        node.type == expectedType
        node.cardinality == cardinality
        node.prefillable
        node.prefillKey == "prefs/" + basePath

        where:
        description                       | basePath   | cardinality        | expectedType
        "SINGLE off a single-valued base" | "speed"    | Cardinality.SINGLE | AttributeType.ENUM
        "LIST off a single-valued base"   | "speed"    | Cardinality.LIST   | AttributeType.ENUM
        "SINGLE off a list-valued base"   | "surfaces" | Cardinality.SINGLE | AttributeType.LIST
        "LIST off a list-valued base"     | "surfaces" | Cardinality.LIST   | AttributeType.LIST
    }

    def "the expander does not carry the base target's defaultValue onto the #ref node (D9)"() {
        given:
        def baseSchema = base([bGroup("gear", [
                StringAttribute.builder().key("note").label(["en": "Note"]).isAvailable(true).defaultValue("bring water").build()
        ])])
        def d = derived([dGroup("setup", [ref("note", "gear/note")])])

        when:
        def expanded = DerivedSchemaExpander.expand(baseSchema, d)

        then:
        expanded.schema().groups[0].attributes[0] instanceof StringAttribute
        ((StringAttribute) expanded.schema().groups[0].attributes[0]).defaultValue == null
    }
}
