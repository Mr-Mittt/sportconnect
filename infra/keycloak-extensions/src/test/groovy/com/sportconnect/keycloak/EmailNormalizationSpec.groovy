package com.sportconnect.keycloak

import java.util.stream.Stream

import org.keycloak.authentication.AuthenticationFlowContext
import org.keycloak.authentication.authenticators.broker.util.SerializedBrokeredIdentityContext
import org.keycloak.broker.provider.BrokeredIdentityContext
import org.keycloak.models.KeycloakContext
import org.keycloak.models.KeycloakSession
import org.keycloak.models.RealmModel
import org.keycloak.models.UserModel
import org.keycloak.models.UserProvider
import org.keycloak.userprofile.AttributeContext
import org.keycloak.userprofile.Attributes
import org.keycloak.userprofile.UserProfileAttributeValidationContext
import org.keycloak.userprofile.UserProfileContext
import org.keycloak.validate.ValidatorConfig
import spock.lang.Specification

class EmailNormalizationSpec extends Specification {

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

    private UserProfileAttributeValidationContext contextFor(UserModel editing, UserProfileContext profileContext = UserProfileContext.REGISTRATION) {
        def entry = new AbstractMap.SimpleEntry<String, List<String>>("email", ["x"])
        new UserProfileAttributeValidationContext(new AttributeContext(profileContext, session, entry, editing, null, attributes))
    }

    private UserModel user(String id) {
        UserModel u = Mock()
        u.getId() >> id
        u
    }

    def "an email whose Gmail spelling is held by another account is refused"() {
        given:
        def other = user("other")

        when:
        def result = new UniqueNormalizedEmailValidator().validate(typed, "email", contextFor(null), ValidatorConfig.EMPTY)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "email_normalized", "baonguyendangit@gmail.com") >> Stream.of(other)
        !result.isValid()
        result.errors.first().message == "emailAlreadyUsed"

        where:
        typed << ["bao.nguyen.dangit@gmail.com", "BaoNguyenDangit+x@googlemail.com", ["baonguyendangit@gmail.com"]]
    }

    def "the user being edited is not a clash with themself"() {
        given:
        def me = user("me")

        when:
        def result = new UniqueNormalizedEmailValidator().validate("bao.nguyendangit@gmail.com", "email", contextFor(me), ValidatorConfig.EMPTY)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "email_normalized", "baonguyendangit@gmail.com") >> Stream.of(me)
        result.isValid()
    }

    def "the first-broker-login review step is not validated, so a clash reaches the existing-account confirmation"() {
        when:
        def result = new UniqueNormalizedEmailValidator().validate("bao.nguyen.dangit@gmail.com", "email",
                contextFor(null, UserProfileContext.IDP_REVIEW), ValidatorConfig.EMPTY)

        then:
        0 * users._
        result.isValid()
    }

    def "no email is nothing to compare"() {
        when:
        def result = new UniqueNormalizedEmailValidator().validate(typed, "email", contextFor(null), ValidatorConfig.EMPTY)

        then:
        0 * users._
        result.isValid()

        where:
        typed << [null, "", "  ", []]
    }

    def "the listener stores, updates and clears email_normalized"() {
        given:
        UserModel u = Mock()
        u.getEmail() >> email
        u.getFirstAttribute("email_normalized") >> stored

        when:
        EmailNormalizingEventListener.apply(u)

        then:
        setCalls * u.setSingleAttribute("email_normalized", "baonguyendangit@gmail.com")
        removeCalls * u.removeAttribute("email_normalized")

        where:
        email                         | stored                        | setCalls | removeCalls
        "Bao.Nguyen.Dangit@gmail.com" | null                          | 1        | 0
        "Bao.Nguyen.Dangit@gmail.com" | "old@gmail.com"               | 1        | 0
        "Bao.Nguyen.Dangit@gmail.com" | "baonguyendangit@gmail.com"   | 0        | 0
        null                          | "baonguyendangit@gmail.com"   | 0        | 1
        null                          | null                          | 0        | 0
    }

    def "the broker step finds an existing user by the normalized email when the exact check finds none"() {
        given:
        def existing = Mock(UserModel) {
            getId() >> "existing"
            getEmail() >> "bao.nguyen.dangit@gmail.com"
        }
        def flow = Mock(AuthenticationFlowContext) {
            getRealm() >> realm
            getSession() >> session
        }
        def broker = Mock(BrokeredIdentityContext) {
            getEmail() >> "baonguyendangit@gmail.com"
            getUsername() >> "google-sub"
        }
        def serialized = Mock(SerializedBrokeredIdentityContext)
        realm.isDuplicateEmailsAllowed() >> false

        when:
        def found = new NormalizedCreateUserIfUniqueAuthenticator().checkExistingUser(flow, "google-sub", serialized, broker)

        then:
        1 * users.searchForUserByUserAttributeStream(realm, "email_normalized", "baonguyendangit@gmail.com") >> Stream.of(existing)
        found.existingUserId == "existing"
        found.duplicateAttributeName == "email"
        found.duplicateAttributeValue == "bao.nguyen.dangit@gmail.com"
    }

    def "the broker step creates a new user when nothing matches"() {
        given:
        def flow = Mock(AuthenticationFlowContext) {
            getRealm() >> realm
            getSession() >> session
        }
        def broker = Mock(BrokeredIdentityContext) {
            getEmail() >> "someone@outlook.com"
            getUsername() >> "google-sub"
        }
        realm.isDuplicateEmailsAllowed() >> false
        users.searchForUserByUserAttributeStream(_, _, _) >> Stream.empty()

        expect:
        new NormalizedCreateUserIfUniqueAuthenticator().checkExistingUser(flow, "google-sub", Mock(SerializedBrokeredIdentityContext), broker) == null
    }
}
