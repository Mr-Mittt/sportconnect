package com.sportconnect.common.attributes.json

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.Cardinality
import com.sportconnect.common.attributes.field.DefinitionField
import com.sportconnect.common.attributes.field.NumberField
import com.sportconnect.common.attributes.node.DefinitionAttribute
import com.sportconnect.common.attributes.node.DefinitionListAttribute
import com.sportconnect.common.attributes.node.EnumAttribute
import com.sportconnect.common.attributes.node.NumberAttribute
import com.sportconnect.common.attributes.node.RefAttribute
import com.sportconnect.common.attributes.node.StringAttribute
import spock.lang.Specification

/**
 * C5 acceptance: the sealed DTO tree parses every currently-accepted schema document and
 * re-serialises it renaming nothing, dropping nothing, changing no value (extraction plan D7),
 * and rejects a misplaced field at parse (D8).
 */
class AttributeSchemaJsonSpec extends Specification {

    ObjectMapper mapper = AttributeJson.mapper()

    private String resource(String name) {
        getClass().getResourceAsStream("/attributes/${name}").getText('UTF-8')
    }

    /** Every "/"-joined field path present anywhere in {@code node}. */
    private static Set<String> fieldPaths(JsonNode node, String prefix = '') {
        Set<String> acc = []
        if (node.isObject()) {
            node.fieldNames().each { String f ->
                acc << "${prefix}/${f}".toString()
                acc.addAll(fieldPaths(node.get(f), "${prefix}/${f}"))
            }
        } else if (node.isArray()) {
            node.forEach { JsonNode el -> acc.addAll(fieldPaths(el, "${prefix}[]")) }
        }
        acc
    }

    def "parses the real seeded Badminton v3 profile schema and round-trips it"() {
        given:
        String json = resource('badminton-v3-profile-schema.json')

        when:
        AttributeSchema schema = mapper.readValue(json, AttributeSchema)

        then: "structure survived"
        schema.defaultLocale == 'en'
        schema.definitions*.name == ['Reference', 'ShoeSize', 'Shoe']
        schema.groups*.key == ['general', 'gear']
        schema.groups[1].attributes.every { it instanceof DefinitionListAttribute }
        (schema.groups[1].attributes[0] as DefinitionListAttribute).definitionRef == 'Reference'
        (schema.groups[1].attributes[0] as DefinitionListAttribute).searchScope == 'equipment.racket.badminton'
        (schema.groups[0].attributes[0] as EnumAttribute).options*.value == ['LEFT', 'RIGHT']
        ((schema.definitions[2].fields[0]) as DefinitionField).definitionRef == 'Reference'

        and: "re-serialise -> re-parse is stable"
        AttributeSchema reparsed = mapper.readValue(mapper.writeValueAsString(schema), AttributeSchema)
        reparsed == schema

        and: "no field renamed or dropped vs the original JSON"
        Set<String> before = fieldPaths(mapper.readTree(json))
        Set<String> after = fieldPaths(mapper.valueToTree(schema) as JsonNode)
        after == before
    }

    def "round-trips a comprehensive fixture covering every node and field kind"() {
        given:
        String json = resource('comprehensive-schema.json')

        when:
        AttributeSchema schema = mapper.readValue(json, AttributeSchema)

        then: "each node deserialised to its own subtype"
        def general = schema.groups.find { it.key == 'general' }.attributes
        general.find { it.key == 'nickname' } instanceof StringAttribute
        general.find { it.key == 'reach' } instanceof NumberAttribute
        (general.find { it.key == 'reach' } as NumberAttribute).min == 120.0d
        (general.find { it.key == 'reach' } as NumberAttribute).max == 230.0d
        (general.find { it.key == 'reach' } as NumberAttribute).defaultValue == 175
        general.find { it.key == 'surfaces' }.class.simpleName == 'ListAttribute'
        general.find { it.key == 'surfaces' }.isAvailable == false

        and: "nested groups preserved"
        def rackets = schema.groups.find { it.key == 'gear' }.groups.find { it.key == 'rackets' }
        rackets.attributes.find { it.key == 'primary' } instanceof DefinitionAttribute
        rackets.attributes.find { it.key == 'grips' } instanceof DefinitionListAttribute

        and: "definition fields deserialised to their own subtypes"
        def grip = schema.definitions.find { it.name == 'Grip' }
        grip.fields.find { it.key == 'thickness' } instanceof NumberField
        (grip.fields.find { it.key == 'thickness' } as NumberField).max == 2.0d
        grip.fields.find { it.key == 'brand' } instanceof DefinitionField

        and: "C11 layout / hidden carried on nodes, fields and groups"
        def reach = schema.groups.find { it.key == 'general' }.attributes.find { it.key == 'reach' } as NumberAttribute
        reach.layout.id == 'slider'
        reach.layout.icon == 'ruler'
        reach.layout.format == ['en': '#,##0 cm', 'vi': '#,##0 cm']   // still a raw locale map, not resolved
        schema.groups.find { it.key == 'general' }.attributes.find { it.key == 'leftHanded' }.hidden
        (schema.groups.find { it.key == 'gear' }).layout.id == 'grid-2'
        def refDef = schema.definitions.find { it.name == 'Reference' }
        refDef.fields.find { it.key == 'id' }.hidden
        refDef.fields.find { it.key == 'value' }.layout.id == 'input'
        (schema.definitions.find { it.name == 'Grip' }.fields.find { it.key == 'thickness' } as NumberField).layout.format == ['en': '0.0', 'vi': '0,0']

        and: "stable + lossless"
        AttributeSchema reparsed = mapper.readValue(mapper.writeValueAsString(schema), AttributeSchema)
        reparsed == schema
        fieldPaths(mapper.valueToTree(schema) as JsonNode) == fieldPaths(mapper.readTree(json))
    }

    def "a NUMBER integer defaultValue round-trips without widening to a decimal"() {
        given:
        String json = resource('comprehensive-schema.json')

        when:
        AttributeSchema schema = mapper.readValue(json, AttributeSchema)
        JsonNode out = mapper.readTree(mapper.writeValueAsString(schema))

        then:
        out.path('groups').get(0).path('attributes')
                .find { it.path('key').asText() == 'reach' }.path('defaultValue').toString() == '175'
    }

    def "round-trips a derived schema with #ref nodes"() {
        given:
        String json = resource('derived-schema.json')

        when:
        AttributeSchema schema = mapper.readValue(json, AttributeSchema)
        def nodes = schema.groups[0].attributes

        then:
        def shuttlecock = nodes.find { it.key == 'shuttlecock' } as RefAttribute
        shuttlecock.ref == 'gear/shuttlecocks'
        shuttlecock.cardinality == Cardinality.SINGLE
        shuttlecock.label == null

        def rackets = nodes.find { it.key == 'rackets' } as RefAttribute
        rackets.cardinality == Cardinality.LIST
        rackets.label == ['en': 'Rackets in play']

        and: "the #ref JSON key and the REF discriminator survive re-serialisation"
        JsonNode out = mapper.readTree(mapper.writeValueAsString(schema))
        JsonNode refOut = out.path('groups').get(0).path('attributes').find { it.path('key').asText() == 'shuttlecock' }
        refOut.path('#ref').asText() == 'gear/shuttlecocks'
        refOut.path('type').asText() == 'REF'

        and: "C11 layout / hidden / fieldLayouts carried on the #ref nodes verbatim"
        shuttlecock.layout.id == 'radio'
        shuttlecock.layout.format == ['en': 'titlecase']
        shuttlecock.hidden
        rackets.layout.id == 'chips'
        rackets.fieldLayouts.keySet() == ['value', 'bogusKey'] as Set
        rackets.fieldLayouts['value'].id == 'input'
        rackets.fieldLayouts['value'].icon == 'tag'
        rackets.fieldLayouts['bogusKey'].hidden

        and: "stable"
        mapper.readValue(mapper.writeValueAsString(schema), AttributeSchema) == schema
    }

    def "tolerates an unknown property inside a layout object (dropped, not rejected)"() {
        given: "a layout carrying a property this model version does not know"
        String json = '''
        { "defaultLocale": "en", "groups": [ { "key": "g", "label": {"en":"G"}, "attributes": [
          { "key": "x", "label": {"en":"X"}, "type": "STRING",
            "layout": { "id": "textarea", "density": "compact", "rows": 4 } } ] } ] }
        '''

        when:
        AttributeSchema schema = mapper.readValue(json, AttributeSchema)
        def node = schema.groups[0].attributes[0] as StringAttribute

        then: "known props kept, unknown ones silently dropped — never a parse failure"
        node.layout.id == 'textarea'
        JsonNode layoutOut = mapper.valueToTree(schema).path('groups').get(0).path('attributes').get(0).path('layout')
        layoutOut.fieldNames().collect() == ['id']
    }

    def "rejects an unknown field for a subtype at parse time"() {
        given: "a STRING node carrying min — legal JSON, but min belongs only on NUMBER"
        String json = '''
        { "defaultLocale": "en", "groups": [ { "key": "g", "label": {"en":"G"},
          "attributes": [ { "key": "x", "label": {"en":"X"}, "type": "STRING", "min": 1 } ] } ] }
        '''

        when:
        mapper.readValue(json, AttributeSchema)

        then:
        UnrecognizedPropertyException e = thrown()
        e.propertyName == 'min'
    }

    def "an unknown top-level field is also rejected"() {
        when:
        mapper.readValue('{ "defaultLocale": "en", "groups": [], "bogus": 1 }', AttributeSchema)

        then:
        thrown(UnrecognizedPropertyException)
    }
}
