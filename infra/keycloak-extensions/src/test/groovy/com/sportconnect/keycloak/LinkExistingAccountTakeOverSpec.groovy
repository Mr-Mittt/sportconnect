package com.sportconnect.keycloak

import org.keycloak.authentication.AuthenticationFlowContext
import org.keycloak.credential.CredentialModel
import org.keycloak.models.KeycloakSession
import org.keycloak.models.RealmModel
import org.keycloak.models.SubjectCredentialManager
import org.keycloak.models.UserModel
import org.keycloak.models.UserSessionProvider
import org.keycloak.models.credential.PasswordCredentialModel
import org.keycloak.sessions.AuthenticationSessionModel
import spock.lang.Specification
import spock.lang.Unroll

import java.util.stream.Stream

/**
 * A33: a link-by-email proof on an account that was not verified when the email was sent gives the account to the
 * mailbox owner, so the squatter's password and sessions go; a verified account is left alone.
 */
class LinkExistingAccountTakeOverSpec extends Specification {

    @Unroll
    def "the note '#note' means unverified-at-send: #unverified"() {
        given:
        def session = Mock(AuthenticationSessionModel) {
            getAuthNote(LinkExistingAccountAuthenticator.VERIFIED_AT_SEND_NOTE) >> note
        }

        expect:
        LinkExistingAccountAuthenticator.wasUnverifiedAtSend(session) == unverified

        where:
        note    || unverified
        'false' || true
        null    || true
        'true'  || false
    }

    def "taking over removes every password credential, ends the sessions and marks the email verified"() {
        given:
        def password1 = Stub(CredentialModel) { getId() >> 'c1' }
        def password2 = Stub(CredentialModel) { getId() >> 'c2' }
        def credentials = Mock(SubjectCredentialManager)
        def user = Mock(UserModel) { credentialManager() >> credentials }
        def realm = Stub(RealmModel)
        def sessionProvider = Mock(UserSessionProvider)
        def keycloak = Stub(KeycloakSession) { sessions() >> sessionProvider }
        def context = Stub(AuthenticationFlowContext) {
            getSession() >> keycloak
            getRealm() >> realm
        }

        when:
        LinkExistingAccountAuthenticator.takeOverUnverifiedAccount(context, user)

        then:
        1 * credentials.getStoredCredentialsByTypeStream(PasswordCredentialModel.TYPE) >> Stream.of(password1, password2)
        1 * credentials.removeStoredCredentialById('c1')
        1 * credentials.removeStoredCredentialById('c2')
        1 * sessionProvider.removeUserSessions(realm, user)
        1 * user.setEmailVerified(true)
    }

    def "taking over an account with no password still ends the sessions"() {
        given:
        def credentials = Mock(SubjectCredentialManager)
        def user = Mock(UserModel) { credentialManager() >> credentials }
        def realm = Stub(RealmModel)
        def sessionProvider = Mock(UserSessionProvider)
        def context = Stub(AuthenticationFlowContext) {
            getSession() >> Stub(KeycloakSession) { sessions() >> sessionProvider }
            getRealm() >> realm
        }

        when:
        LinkExistingAccountAuthenticator.takeOverUnverifiedAccount(context, user)

        then:
        1 * credentials.getStoredCredentialsByTypeStream(PasswordCredentialModel.TYPE) >> Stream.empty()
        0 * credentials.removeStoredCredentialById(_)
        1 * sessionProvider.removeUserSessions(realm, user)
    }
}
