package com.sportconnect.common.attributes.value

import com.sportconnect.common.attributes.AttributeDefinitionType
import com.sportconnect.common.attributes.AttributeOption
import com.sportconnect.common.attributes.AttributeType
import com.sportconnect.common.attributes.field.DefinitionField
import com.sportconnect.common.attributes.field.EnumField
import com.sportconnect.common.attributes.field.NumberField
import com.sportconnect.common.attributes.field.StringField
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C6: the primitive core lifted from sport {@code SportAttributeValues.isValid}. C7: the record
 * cascade ({@code isValidRecord}) + scalar/record dispatcher ({@code filterScalarOrRecord}). The
 * {@code DEFINITION_LIST} iteration + drop-invalid filter is {@code AttributeValueFilter}
 * (see {@code AttributeValueFilterSpec}). Behaviour parity, extraction plan D11.
 */
class AttributeValuesSpec extends Specification {

    @Unroll
    def "isValid(#value as #type) == #expected"() {
        expect:
        AttributeValues.isValid(value, type, allowed as Set, min, max) == expected

        where:
        type                      | value            | allowed          | min   | max   || expected
        AttributeType.STRING      | "x"              | []               | null  | null  || true
        AttributeType.STRING      | 42               | []               | null  | null  || false
        AttributeType.STRING      | true             | []               | null  | null  || false
        AttributeType.STRING      | null             | []               | null  | null  || false

        AttributeType.NUMBER      | 27               | []               | null  | null  || true
        AttributeType.NUMBER      | 27L              | []               | null  | null  || true
        AttributeType.NUMBER      | 27.5d            | []               | null  | null  || true
        AttributeType.NUMBER      | "27"             | []               | null  | null  || false
        AttributeType.NUMBER      | true             | []               | null  | null  || false
        AttributeType.NUMBER      | 15.0d            | []               | 15.0d | 35.0d || true
        AttributeType.NUMBER      | 35.0d            | []               | 15.0d | 35.0d || true
        AttributeType.NUMBER      | 10.0d            | []               | 15.0d | 35.0d || false
        AttributeType.NUMBER      | 40.0d            | []               | 15.0d | 35.0d || false
        AttributeType.NUMBER      | Double.NaN       | []               | null  | null  || false
        AttributeType.NUMBER      | Double.POSITIVE_INFINITY | []       | null  | null  || false

        AttributeType.BOOLEAN     | true             | []               | null  | null  || true
        AttributeType.BOOLEAN     | false            | []               | null  | null  || true
        AttributeType.BOOLEAN     | "true"           | []               | null  | null  || false
        AttributeType.BOOLEAN     | 1                | []               | null  | null  || false

        AttributeType.ENUM        | "a"              | ["a", "b"]       | null  | null  || true
        AttributeType.ENUM        | "c"              | ["a", "b"]       | null  | null  || false
        AttributeType.ENUM        | 1                | ["a", "b"]       | null  | null  || false

        AttributeType.LIST        | []               | ["a", "b"]       | null  | null  || true
        AttributeType.LIST        | ["a"]            | ["a", "b"]       | null  | null  || true
        AttributeType.LIST        | ["a", "b"]       | ["a", "b"]       | null  | null  || true
        AttributeType.LIST        | ["a", "c"]       | ["a", "b"]       | null  | null  || false
        AttributeType.LIST        | "a"              | ["a", "b"]       | null  | null  || false
        AttributeType.LIST        | (1..10).collect { "a" } | ["a"]     | null  | null  || true
        AttributeType.LIST        | (1..11).collect { "a" } | ["a"]     | null  | null  || false
    }

    def "isValid throws for record types — those go through the C7 dispatcher"() {
        when:
        AttributeValues.isValid([:], type, [] as Set, null, null)

        then:
        thrown(IllegalStateException)

        where:
        type << [AttributeType.DEFINITION, AttributeType.DEFINITION_LIST]
    }

    def "optionValues collects the option values, null-safe"() {
        expect:
        AttributeValues.optionValues(null).isEmpty()
        AttributeValues.optionValues([
                new AttributeOption("a", [en: "A"]), new AttributeOption("b", [en: "B"])
        ]) == ["a", "b"] as Set
    }

    // ---- C7: isValidRecord + filterScalarOrRecord ----

    private static AttributeOption o(String v) { AttributeOption.builder().value(v).label([en: v]).build() }

    /** Reference{id?, value(required)}, ShoeSize{system:ENUM(required), value(required)}, Shoe{shoe:Reference(required), size:ShoeSize?}. */
    private static Map<String, AttributeDefinitionType> registry() {
        def reference = AttributeDefinitionType.builder().name("Reference").fields([
                StringField.builder().key("id").label([en: "id"]).isRequired(false).build(),
                StringField.builder().key("value").label([en: "value"]).isRequired(true).build()
        ]).build()
        def shoeSize = AttributeDefinitionType.builder().name("ShoeSize").fields([
                EnumField.builder().key("system").label([en: "system"]).isRequired(true).options([o("US"), o("UK")]).build(),
                StringField.builder().key("value").label([en: "value"]).isRequired(true).build()
        ]).build()
        def shoe = AttributeDefinitionType.builder().name("Shoe").fields([
                DefinitionField.builder().key("shoe").label([en: "shoe"]).definitionRef("Reference").isRequired(true).build(),
                DefinitionField.builder().key("size").label([en: "size"]).definitionRef("ShoeSize").isRequired(false).build()
        ]).build()
        [Reference: reference, ShoeSize: shoeSize, Shoe: shoe]
    }

    def "isValidRecord keeps declared fields, drops undeclared keys"() {
        expect:
        AttributeValues.isValidRecord([value: "Yonex", junk: "x"], registry().Reference, registry()) == [value: "Yonex"]
    }

    def "isValidRecord returns null when a required field is missing"() {
        expect:
        AttributeValues.isValidRecord([id: "eq_1"], registry().Reference, registry()) == null
    }

    def "isValidRecord drops an invalid optional field but keeps the record"() {
        expect:
        AttributeValues.isValidRecord([value: "Yonex", id: 42], registry().Reference, registry()) == [value: "Yonex"]
    }

    def "isValidRecord recurses: an invalid required nested field nulls the outer record"() {
        expect: "Shoe.shoe (Reference) is required; here its own required 'value' is missing"
        AttributeValues.isValidRecord([shoe: [id: "eq_1"]], registry().Shoe, registry()) == null
    }

    def "isValidRecord recurses: an invalid optional nested record is dropped, outer survives"() {
        expect: "Shoe.size (ShoeSize) is optional; its required 'system' is invalid"
        AttributeValues.isValidRecord([shoe: [value: "Aerus"], size: [system: "bad", value: "9"]], registry().Shoe, registry()) ==
                [shoe: [value: "Aerus"]]
    }

    def "isValidRecord returns null for a null record or null definition"() {
        expect:
        AttributeValues.isValidRecord(null, registry().Reference, registry()) == null
        AttributeValues.isValidRecord([value: "x"], null, registry()) == null
    }

    @Unroll
    def "filterScalarOrRecord on a primitive: #description"() {
        expect:
        AttributeValues.filterScalarOrRecord(raw, type, allowed as Set, min, max, null, [:]) == expected

        where:
        description        | raw   | type                  | allowed | min | max || expected
        "valid string"     | "x"   | AttributeType.STRING  | []      | null | null || "x"
        "invalid string"   | 1     | AttributeType.STRING  | []      | null | null || null
        "valid enum"       | "a"   | AttributeType.ENUM    | ["a"]   | null | null || "a"
        "number in bounds" | 20    | AttributeType.NUMBER  | []      | 15d  | 35d  || 20
        "number out"       | 40    | AttributeType.NUMBER  | []      | 15d  | 35d  || null
    }

    def "filterScalarOrRecord on a DEFINITION returns the filtered record"() {
        expect:
        AttributeValues.filterScalarOrRecord([value: "Yonex", junk: 1], AttributeType.DEFINITION, [] as Set, null, null, "Reference", registry()) ==
                [value: "Yonex"]
    }

    def "filterScalarOrRecord on a non-map DEFINITION value returns null"() {
        expect:
        AttributeValues.filterScalarOrRecord("not a record", AttributeType.DEFINITION, [] as Set, null, null, "Reference", registry()) == null
    }

    def "filterScalarOrRecord throws for DEFINITION_LIST — the caller must iterate"() {
        when:
        AttributeValues.filterScalarOrRecord([], AttributeType.DEFINITION_LIST, [] as Set, null, null, "Reference", registry())

        then:
        thrown(IllegalStateException)
    }

    @Unroll
    def "asRecord(#input) == #expected"() {
        expect:
        AttributeValues.asRecord(input) == expected

        where:
        input        | expected
        [a: 1]       | [a: 1]
        "x"          | null
        42           | null
        null         | null
    }
}
