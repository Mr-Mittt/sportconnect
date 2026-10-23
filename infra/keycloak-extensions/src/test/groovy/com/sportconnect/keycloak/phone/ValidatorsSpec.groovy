package com.sportconnect.keycloak.phone

import java.util.stream.Stream

import org.keycloak.models.KeycloakContext
import org.keycloak.models.KeycloakSession
import org.keycloak.models.RealmModel
import org.keycloak.models.UserModel
import org.keycloak.models.UserProvider
import org.keycloak.userprofile.AttributeContext
import org.keycloak.userprofile.Attributes
import org.keycloak.userprofile.UserProfileAttributeValidationContext
import org.keycloak.validate.ValidatorConfig
import spock.lang.Specification

class ValidatorsSpec extends Specification {

    KeycloakSession session = Mock()
    KeycloakContext keycloakContext = Mock()
    RealmModel realm = Mock()
    UserProvider users = Mock()
    Attributes attributes = Mock()

    def setup() {
        session.getContext() >> keycloakContext
        keycloakContext.getRealm() >> realm
        session.users() >> users
    }

    private UserProfileAttributeValidationContext contextFor(UserModel editing) {
        def entry = new AbstractMap.SimpleEntry<String, List<String>>("phoneNumber", ["x"])
        new UserProfileAttributeValidationContext(new AttributeContext(null, session, entry, editing, null, attributes))
    }

    private UserModel user(String id) {
        UserModel u = Mock()
        u.getId() >> id
        u
    }

    def "a phone held by another account is refused, in any spelling"() {
        given:
        def other = user("other")
        def ctx = contextFor(null)

        when:
        def result = new UniquePhoneValidator().validate(typed, "phoneNumber", ctx, ValidatorConfig.EMPTY)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "phoneNumber", "+84901234567") >> Stream.of(other)
        !result.isValid()
        result.errors.first().message == "phoneNumberAlreadyUsed"

        where:
        typed << ["0901234567", "+84 901 234 567", ["0901234567"]]
    }

    def "the user being edited is not a clash with themself"() {
        given:
        def me = user("me")
        def ctx = contextFor(me)

        when:
        def result = new UniquePhoneValidator().validate("0901234567", "phoneNumber", ctx, ValidatorConfig.EMPTY)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "phoneNumber", "+84901234567") >> Stream.of(me)
        result.isValid()
    }

    def "an unparseable phone is compared as typed"() {
        given:
        def ctx = contextFor(null)

        when:
        def result = new UniquePhoneValidator().validate("  ext-12 ", "phoneNumber", ctx, ValidatorConfig.EMPTY)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "phoneNumber", "ext-12") >> Stream.of(user("other"))
        !result.isValid()
    }

    def "no phone is nothing to compare"() {
        when:
        def result = new UniquePhoneValidator().validate(typed, "phoneNumber", contextFor(null), ValidatorConfig.EMPTY)

        then:
        0 * users._
        result.isValid()

        where:
        typed << [null, "", "  ", []]
    }

    def "email or phone: an email, a usable phone or both pass; an unusable phone alone and nothing fail"() {
        given:
        attributes.getFirst("email") >> email
        attributes.getFirst("phoneNumber") >> phone

        when:
        def result = new EmailOrPhoneValidator().validate(null, "email", contextFor(null), ValidatorConfig.EMPTY)

        then:
        result.isValid() == valid
        valid || result.errors.first().message == "emailOrPhoneRequired"

        where:
        email   | phone        | valid
        "a@b.c" | null         | true
        null    | "0901234567" | true
        "a@b.c" | "0901234567" | true
        "a@b.c" | "ext-12"     | true
        null    | "ext-12"     | false
        null    | null         | false
        ""      | " "          | false
    }
}
