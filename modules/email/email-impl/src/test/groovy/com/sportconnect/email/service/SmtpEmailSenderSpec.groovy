package com.sportconnect.email.service

import com.sportconnect.email.api.EmailMessage
import org.springframework.mail.MailSendException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.test.util.ReflectionTestUtils
import spock.lang.Specification
import spock.lang.Subject

class SmtpEmailSenderSpec extends Specification {

    JavaMailSender mailSender = Mock()

    @Subject
    SmtpEmailSender sender = new SmtpEmailSender(mailSender)

    def setup() {
        ReflectionTestUtils.setField(sender, "fromEmail", "noreply@sportconnect.com")
    }

    def "send hands the caller's text to the mail sender untouched, from the configured address"() {
        when:
        sender.send(EmailMessage.builder().to("a@x.com").subject("Chủ đề").body("Nội dung\nline 2").build())

        then:
        1 * mailSender.send({ SimpleMailMessage m ->
            m.from == "noreply@sportconnect.com" && m.to == ["a@x.com"] as String[] &&
                    m.subject == "Chủ đề" && m.text == "Nội dung\nline 2"
        })
    }

    def "a delivery failure is swallowed, never thrown to the caller"() {
        given:
        mailSender.send(_ as SimpleMailMessage) >> { throw new MailSendException("smtp down") }

        when:
        sender.send(EmailMessage.builder().to("a@x.com").subject("s").body("b").build())

        then:
        noExceptionThrown()
    }
}
