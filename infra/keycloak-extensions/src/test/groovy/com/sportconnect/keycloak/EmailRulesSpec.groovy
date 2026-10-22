package com.sportconnect.keycloak

import spock.lang.Specification

class EmailRulesSpec extends Specification {

    def "Gmail spellings of one mailbox share a key"() {
        expect:
        EmailRules.normalized(typed) == "jordanleesmith@gmail.com"

        where:
        typed << [
                "jordanleesmith@gmail.com",
                "jordan.lee.smith@gmail.com",
                "Jordan.Lee.Smith@Gmail.com",
                "jordanleesmith+shop@gmail.com",
                "jordan.lee.smith+a+b@gmail.com",
                "jordanleesmith@googlemail.com",
                "  jordan.leesmith@GOOGLEMAIL.COM ",
        ]
    }

    def "other domains are lowercased and nothing else is stripped"() {
        expect:
        EmailRules.normalized(typed) == expected

        where:
        typed                   | expected
        "A.B@Outlook.com"       | "a.b@outlook.com"
        "ab@outlook.com"        | "ab@outlook.com"
        "bao+tag@outlook.com"   | "bao+tag@outlook.com"
        "bao.x@company.vn"      | "bao.x@company.vn"
        "bao.x@mail.gmail.com"  | "bao.x@mail.gmail.com"
    }

    def "a local part that would collapse to nothing keeps its lowercase form"() {
        expect:
        EmailRules.normalized(typed) == typed.toLowerCase()

        where:
        typed << ["+tag@gmail.com", "..@gmail.com"]
    }

    def "blank or malformed values have no key"() {
        expect:
        EmailRules.normalized(typed) == null

        where:
        typed << [null, "", "   ", "no-at-sign", "@gmail.com", "bao@"]
    }
}
