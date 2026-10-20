package com.sportconnect.keycloak.phone

import spock.lang.Specification

class PhoneRulesSpec extends Specification {

    def "a number that parses becomes E.164, whatever the spelling"() {
        expect:
        PhoneRules.canonical(typed) == "+84901234567"

        where:
        typed << ["0901234567", "090 123 4567", "+84901234567", "+84 901 234 567", " 0901234567 ", "(090) 123-4567"]
    }

    def "a number that does not parse is kept as typed, trimmed, and never refused"() {
        expect:
        PhoneRules.canonical(typed) == kept
        !PhoneRules.isUsableIdentifier(typed)

        where:
        typed        | kept
        "abc"        | "abc"
        "  ext-12  " | "ext-12"
        "123"        | "123"
    }

    def "blank is no phone"() {
        expect:
        PhoneRules.canonical(typed) == null
        PhoneRules.toE164(typed) == null

        where:
        typed << [null, "", "   "]
    }

    def "only a number that parses is an identifier"() {
        expect:
        PhoneRules.isUsableIdentifier("0901234567")
        PhoneRules.isUsableIdentifier("+84901234567")
        !PhoneRules.isUsableIdentifier("0901")
    }

    def "a foreign number needs its plus"() {
        expect:
        PhoneRules.canonical("+14155552671") == "+14155552671"
    }
}
