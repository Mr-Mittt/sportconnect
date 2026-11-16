package com.sportconnect.user.repository

import spock.lang.Specification

/** SESSION-GL-64 — the pure part of the name-search rule: how a typed query becomes words, parameters and SQL. */
class UserNameSearchSpec extends Specification {

    def "words splits on any whitespace, drops empties and keeps the order"() {
        expect:
        UserNameSearch.words(query) == expected

        where:
        query             || expected
        null              || []
        ""                || []
        "   "             || []
        "tuan"            || ["tuan"]
        "  tuan   anh "   || ["tuan", "anh"]
        "tuan\tanh\nle"   || ["tuan", "anh", "le"]
    }

    def "words keeps at most 5 words and cuts a word to 30 characters"() {
        expect:
        UserNameSearch.words("a b c d e f g") == ["a", "b", "c", "d", "e"]
        UserNameSearch.words("x" * 80) == ["x" * 30]
    }

    def "escapeLike makes percent, underscore and backslash literal"() {
        expect:
        UserNameSearch.escapeLike('50%_off\\') == '50\\%\\_off\\\\'
        UserNameSearch.escapeLike("plain") == "plain"
    }

    def "a blank query keeps only the named-user condition and has no relevance order or parameters"() {
        when:
        def predicate = UserNameSearch.predicate(query)

        then:
        predicate.where() == "(u.first_name IS NOT NULL OR u.last_name IS NOT NULL)"
        predicate.params().isEmpty()
        predicate.first() == null

        where:
        query << [null, "", "   "]
    }

    def "each typed word adds one AND clause over first and last name, and its escaped value is a bound parameter"() {
        when:
        def predicate = UserNameSearch.predicate("Tuấn 50%")

        then: "values are parameters, never in the SQL text"
        predicate.params() == [w0: "Tuấn", w1: "50\\%"]
        !predicate.where().contains("Tuấn")
        !predicate.where().contains("50")

        and: "one clause per word, each checking both names, each both as a field start and as a later word"
        predicate.where().count(":w0") == 4
        predicate.where().count(":w1") == 4
        predicate.where().count("u.first_name") == 1 + 4
        predicate.where().count("u.last_name") == 1 + 4
        predicate.where().count(" AND (") == 2
        predicate.where().contains("LIKE '% ' || immutable_unaccent(lower(:w0))")

        and: "both sides go through the indexed expression and the wildcard escape is declared"
        predicate.where().contains("immutable_unaccent(lower(u.first_name)) LIKE immutable_unaccent(lower(:w0)) || '%' ESCAPE '\\'")
        predicate.where().contains("immutable_unaccent(lower(u.last_name)) LIKE immutable_unaccent(lower(:w1)) || '%' ESCAPE '\\'")
    }

    def "the relevance order looks only at the first typed word"() {
        when:
        def predicate = UserNameSearch.predicate("anh tu")

        then:
        predicate.first().startsWith("CASE WHEN")
        predicate.first().contains(":w0")
        !predicate.first().contains(":w1")
        predicate.first().endsWith("THEN 0 ELSE 1 END")
    }

    def "more than five words build only five clauses"() {
        expect:
        UserNameSearch.predicate("a b c d e f g").params().keySet() as List == ["w0", "w1", "w2", "w3", "w4"]
    }
}
