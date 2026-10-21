package com.sportconnect.auth.service

import spock.lang.Specification
import spock.lang.Unroll

/**
 * U26: the backend's copy of the A35 rule gives the same key as the Keycloak extensions JAR for every row of the shared
 * table (the JAR's own EmailRulesSpec reads the same file). A missing file fails the spec, it is never skipped.
 */
class EmailRulesSpec extends Specification {

    // Gradle runs a module's tests with the module directory (modules/auth/auth-impl) as the working directory.
    static final File EXAMPLES = new File("../../../infra/keycloak-extensions/src/test/resources/email-rules-examples.csv")

    static List<List<String>> rows() {
        assert EXAMPLES.exists(): "shared table not found: ${EXAMPLES.absolutePath}"
        EXAMPLES.readLines("UTF-8")
                .findAll { !it.startsWith("#") && !it.isBlank() }
                .collect { line ->
                    int comma = line.lastIndexOf(",")
                    [line.substring(0, comma), line.substring(comma + 1).trim() ?: null]
                }
    }

    def "the shared table is read and is not empty"() {
        expect:
        rows().size() >= 15
    }

    @Unroll
    def "'#typed' has the key '#key' (the same as the extensions JAR)"() {
        expect:
        EmailRules.normalized(typed) == key

        where:
        [typed, key] << rows()
    }

    def "a null or blank value has no key"() {
        expect:
        EmailRules.normalized(value) == null

        where:
        value << [null, "", "   "]
    }
}
