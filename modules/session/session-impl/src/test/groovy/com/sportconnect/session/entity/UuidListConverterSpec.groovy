package com.sportconnect.session.entity

import spock.lang.Specification

/** The chosen members of a SPECIFIC audience: one text column, unique in Java before the save. */
class UuidListConverterSpec extends Specification {

    UuidListConverter converter = new UuidListConverter()

    def "ids are written as comma-separated UUIDs and read back in the same order"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()

        expect:
        converter.convertToDatabaseColumn([a, b]) == "${a},${b}".toString()
        converter.convertToEntityAttribute("${a},${b}".toString()) == [a, b]
    }

    def "a repeated or null id is dropped before the save, the first occurrence keeps its place"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()

        expect:
        converter.convertToDatabaseColumn([a, b, a, null, b]) == "${a},${b}".toString()
    }

    def "nothing to store is null, and null or blank reads as an empty list"() {
        expect:
        converter.convertToDatabaseColumn(null) == null
        converter.convertToDatabaseColumn([]) == null
        converter.convertToDatabaseColumn([null]) == null   // only nulls: nothing left to store
        converter.convertToEntityAttribute(null) == []
        converter.convertToEntityAttribute("") == []
        converter.convertToEntityAttribute("   ") == []
    }

    def "spaces and empty parts around the commas are tolerated when reading"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()

        expect:
        converter.convertToEntityAttribute(" ${a} , ,${b},".toString()) == [a, b]
    }

    def "a value written and read again is the same list, even at the 500-member ceiling"() {
        given:
        def ids = (1..500).collect { UUID.randomUUID() }

        expect:
        converter.convertToEntityAttribute(converter.convertToDatabaseColumn(ids)) == ids
        converter.convertToDatabaseColumn(ids).length() == 500 * 36 + 499
    }
}
