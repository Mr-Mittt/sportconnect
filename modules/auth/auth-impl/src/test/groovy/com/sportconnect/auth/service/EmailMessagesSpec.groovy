package com.sportconnect.auth.service

import spock.lang.Specification
import spock.lang.Subject

/** A10: which language an email goes out in, and that the en/vi reset text renders correctly. */
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

    def "the English reset email keeps its apostrophe and fills in the link and minutes"() {
        when:
        def body = messages.resetPasswordBody("en", "http://x/reset?token=abc", 60)

        then:
        messages.resetPasswordSubject("en") == "Reset Your Password - SportConnect"
        body.contains("http://x/reset?token=abc")
        body.contains("This link will expire in 60 minutes.")
        body.contains("If you didn't request a password reset")
    }

    def "the Vietnamese reset email is real Vietnamese, not the English text, with the link and minutes"() {
        when:
        def body = messages.resetPasswordBody("vi", "http://x/reset?token=abc", 90)

        then:
        messages.resetPasswordSubject("vi") == "Đặt lại mật khẩu - SportConnect"
        body.contains("http://x/reset?token=abc")
        body.contains("Liên kết này sẽ hết hạn sau 90 phút.")
        !body.contains("Hello")
    }
}
