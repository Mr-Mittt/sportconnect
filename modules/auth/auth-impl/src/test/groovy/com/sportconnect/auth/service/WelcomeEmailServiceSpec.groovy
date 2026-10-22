package com.sportconnect.auth.service

import com.sportconnect.email.api.EmailMessage
import com.sportconnect.email.api.EmailSender
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject

/** A28: the welcome email sent at the first sign-in. */
class WelcomeEmailServiceSpec extends Specification {

    EmailSender emailSender = Mock()
    UserService userService = Mock()

    @Subject
    WelcomeEmailService service = new WelcomeEmailService(emailSender, new EmailMessages(), userService)

    private static UserResponse user(UUID id, String email, String firstName) {
        UserResponse.builder().id(id).email(email).firstName(firstName).build()
    }

    def "sends the welcome message to the user's email in their preferred language"() {
        given:
        def id = UUID.randomUUID()
        userService.findPreferredLanguageCode(id) >> Optional.of("vi")

        when:
        service.sendTo(user(id, "linh@example.com", "Linh"))

        then:
        1 * emailSender.send({ EmailMessage m ->
            m.to == "linh@example.com" && m.subject == "Chào mừng bạn đến với SportConnect!" && m.body.startsWith("Xin chào Linh,")
        })
    }

    def "falls back to English when the user has no usable preferred language, and to a neutral greeting without a name"() {
        given:
        def id = UUID.randomUUID()
        userService.findPreferredLanguageCode(id) >> Optional.empty()

        when:
        service.sendTo(user(id, "x@example.com", null))

        then:
        1 * emailSender.send({ EmailMessage m -> m.subject == "Welcome to SportConnect!" && m.body.startsWith("Hi there,") })
    }

    def "a user without an email (phone-only, Zalo) gets nothing"() {
        when:
        service.sendTo(user(UUID.randomUUID(), email, "No Mail"))

        then:
        0 * emailSender.send(_)

        where:
        email << [null, "", "  "]
    }

    def "a failure to send is swallowed so it can never fail the sign-in"() {
        given:
        def id = UUID.randomUUID()
        userService.findPreferredLanguageCode(id) >> Optional.empty()
        emailSender.send(_) >> { throw new IllegalStateException("smtp down") }

        when:
        service.sendTo(user(id, "x@example.com", "X"))

        then:
        noExceptionThrown()
    }
}
