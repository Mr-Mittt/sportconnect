package com.sportconnect.auth.service

import spock.lang.Specification
import spock.lang.Subject

/** A10, A28: which language an email goes out in, and that the en/vi welcome text renders correctly. */
class EmailMessagesSpec extends Specification {

    @Subject
    EmailMessages messages = new EmailMessages()

    def "resolveLanguage(#candidate) is #expected"() {
        expect:
        messages.resolveLanguage(candidate) == expected

        where:
        candidate              | expected
        Optional.of("vi")      | "vi"
        Optional.of("VI")      | "vi"
        Optional.of("vi-VN")   | "vi"
        Optional.of("vi_VN")   | "vi"
        Optional.of("en")      | "en"
        Optional.of("fr")      | "en"   // no email bundle for it
        Optional.of("")        | "en"
        Optional.empty()       | "en"
    }

    def "the English welcome email addresses the user by first name, or neutrally without one"() {
        expect:
        messages.welcomeSubject("en") == "Welcome to SportConnect!"
        messages.welcomeBody("en", "Linh").startsWith("Hi Linh,")
        messages.welcomeBody("en", null).startsWith("Hi there,")
        messages.welcomeBody("en", "  ").startsWith("Hi there,")
    }

    def "the Vietnamese welcome email is real Vietnamese, not the English text"() {
        when:
        def body = messages.welcomeBody("vi", "Linh")

        then:
        messages.welcomeSubject("vi") != messages.welcomeSubject("en")
        body.contains("Linh")
        !body.contains("Welcome")
    }
}
