package com.sportconnect.keycloak.phone

import jakarta.ws.rs.core.MultivaluedHashMap
import org.keycloak.authentication.ValidationContext
import org.keycloak.http.HttpRequest
import spock.lang.Specification

class RegistrationUsernameFormActionSpec extends Specification {

    def "a missing username becomes the email, else the canonical phone; a given one is left alone"() {
        given:
        def form = new MultivaluedHashMap<String, String>()
        fields.each { k, v -> form.putSingle(k, v) }
        HttpRequest request = Mock()
        request.getDecodedFormParameters() >> form
        ValidationContext context = Mock()
        context.getHttpRequest() >> request

        when:
        new RegistrationUsernameFormAction().validate(context)

        then:
        1 * context.success()
        form.getFirst("username") == expected

        where:
        fields                                      | expected
        [email: " a@b.c "]                          | "a@b.c"
        [email: "a@b.c", phoneNumber: "0901234567"] | "a@b.c"
        [phoneNumber: "0901234567"]                 | "+84901234567"
        [phoneNumber: "ext-12"]                     | null
        [:]                                         | null
        [username: "given", email: "a@b.c"]        | "given"
    }
}
