package com.sportconnect.keycloak.email

import spock.lang.Specification

class EmailRulesSpec extends Specification {

    def "Gmail spellings of one mailbox share a key"() {
        expect:
        EmailRules.normalized(typed) == "baonguyendangit@gmail.com"

        where:
        typed << [
                "baonguyendangit@gmail.com",
                "bao.nguyen.dangit@gmail.com",
                "Bao.Nguyen.Dangit@Gmail.com",
                "baonguyendangit+shop@gmail.com",
                "bao.nguyen.dangit+a+b@gmail.com",
                "baonguyendangit@googlemail.com",
                "  bao.nguyendangit@GOOGLEMAIL.COM ",
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
