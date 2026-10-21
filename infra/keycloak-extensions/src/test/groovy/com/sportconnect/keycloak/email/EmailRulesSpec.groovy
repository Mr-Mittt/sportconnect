package com.sportconnect.keycloak.email

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

    /** U26: the backend (modules/auth/auth-impl EmailRules) keeps a copy of this rule and reads the same table. */
    def "every row of the table shared with the backend's copy of the rule gives its key"() {
        given:
        def stream = getClass().getResourceAsStream("/email-rules-examples.csv")
        assert stream != null: "shared table not found on the test classpath"
        def lines = stream.getText("UTF-8").readLines().findAll { !it.startsWith("#") && !it.isBlank() }

        expect:
        lines.size() >= 15
        lines.every { line ->
            int comma = line.lastIndexOf(",")
            EmailRules.normalized(line.substring(0, comma)) == (line.substring(comma + 1).trim() ?: null)
        }
    }
}
