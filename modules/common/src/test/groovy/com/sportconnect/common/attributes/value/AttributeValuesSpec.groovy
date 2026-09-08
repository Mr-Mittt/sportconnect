package com.sportconnect.common.attributes.value

import com.sportconnect.common.attributes.AttributeType
import spock.lang.Specification
import spock.lang.Unroll

/**
 * C6: the primitive core lifted from sport {@code SportAttributeValues.isValid} — behaviour parity
 * (extraction plan D11). The record cascade / dispatcher / filter layers are C7.
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
                new com.sportconnect.common.attributes.AttributeOption("a", [en: "A"]),
                new com.sportconnect.common.attributes.AttributeOption("b", [en: "B"])
        ]) == ["a", "b"] as Set
    }
}
