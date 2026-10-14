package com.sportconnect.user.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.user.api.dto.PhoneMask
import spock.lang.Specification

/** U23: the single normalisation rule behind users.phone_number (E.164, default region VN) and the display mask. */
class PhoneNumbersSpec extends Specification {

    def "#input is stored as #expected"() {
        expect:
        PhoneNumbers.normalize(input) == expected

        where:
        input                 || expected
        "0901234567"          || "+84901234567"   // Vietnamese national format, leading 0
        "+84901234567"        || "+84901234567"   // already E.164
        "84901234567"         || "+84901234567"   // country code without the plus
        "090 123 4567"        || "+84901234567"
        "(090) 123-4567"      || "+84901234567"
        "  0901234567  "      || "+84901234567"
        "+1 415 555 2671"     || "+14155552671"   // a foreign number keeps its own country code
    }

    def "blank input means no phone, not an error"() {
        expect:
        PhoneNumbers.normalize(input) == null

        where:
        input << [null, "", "   "]
    }

    def "#input is rejected with INVALID_PHONE_NUMBER"() {
        when:
        PhoneNumbers.normalize(input)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "INVALID_PHONE_NUMBER"

        where:
        input << ["abc", "123", "555-0100", "+84 123", "0000000000"]
    }

    def "the same number typed two ways normalises to one value, which is what makes the unique column work"() {
        expect:
        PhoneNumbers.normalize("0901234567") == PhoneNumbers.normalize("+84 901 234 567")
    }

    def "PhoneMask keeps the country code and the last two digits"() {
        expect:
        PhoneMask.mask("+84901234567") == "+84" + ("•" * 7) + "67"
        PhoneMask.mask(null) == null
        PhoneMask.mask(" ") == null
        PhoneMask.mask("+1234") == "+1234"
    }
}
