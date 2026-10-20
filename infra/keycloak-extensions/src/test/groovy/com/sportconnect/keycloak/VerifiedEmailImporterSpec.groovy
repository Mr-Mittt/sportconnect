package com.sportconnect.keycloak

import org.keycloak.broker.provider.BrokeredIdentityContext
import org.keycloak.models.IdentityProviderMapperModel
import org.keycloak.models.IdentityProviderSyncMode
import org.keycloak.models.KeycloakSession
import org.keycloak.models.KeycloakTransaction
import org.keycloak.models.KeycloakTransactionManager
import org.keycloak.models.RealmModel
import org.keycloak.models.UserProvider
import org.keycloak.models.UserModel
import org.keycloak.representations.JsonWebToken
import spock.lang.Specification
import spock.lang.Unroll

/** A33: a new social account starts verified only when the provider says so for the address it was created with. */
class VerifiedEmailImporterSpec extends Specification {

    VerifiedEmailImporter mapper = new VerifiedEmailImporter()

    private static BrokeredIdentityContext brokered(String email, Map claims) {
        def idToken = new JsonWebToken()
        claims.each { key, value -> idToken.setOtherClaims(key as String, value) }
        def context = new BrokeredIdentityContext("sub-1", null)
        context.setEmail(email)
        context.contextData.put('VALIDATED_ID_TOKEN', idToken) // the literal: the class constant would load RESTEasy-dependent provider code
        context
    }

    @Unroll
    def "a claim of #claim is #expected"() {
        expect:
        VerifiedEmailImporter.isTrue(claim) == expected

        where:
        claim   || expected
        true    || true
        'true'  || true
        ' TRUE '|| true
        false   || false
        'false' || false
        'yes'   || false
        null    || false
        1       || false
    }

    /** Runs the import and then the transaction it enlisted, as Keycloak does at the end of the request; returns the user it wrote to. */
    private void importThenCommit(UserModel user, String providerEmail, Map claims) {
        def userProvider = Stub(UserProvider) { getUserById(_, 'u-1') >> user }
        def transactionManager = Mock(KeycloakTransactionManager)
        def session = Stub(KeycloakSession) { getTransactionManager() >> transactionManager; users() >> userProvider; getProvider(UserProvider) >> userProvider }
        KeycloakTransaction enlisted = null
        transactionManager.enlistPrepare(_) >> { KeycloakTransaction tx -> enlisted = tx }

        mapper.importNewUser(session, Stub(RealmModel), user, new IdentityProviderMapperModel(), brokered(providerEmail, claims))
        if (enlisted != null) {
            enlisted.begin()
            enlisted.commit()
        }
    }

    private UserModel userWithEmail(String email) {
        Mock(UserModel) { getId() >> 'u-1'; getEmail() >> email }
    }

    def "a new user whose provider says the email is verified is marked verified, once the request is about to commit"() {
        given:
        def user = userWithEmail('Jordan@Gmail.com')

        when:
        importThenCommit(user, 'jordan@gmail.com', [email_verified: true])

        then:
        1 * user.setEmailVerified(true)
    }

    def "nothing is written during the import itself (Keycloak resets the flag later in the request)"() {
        given:
        def user = Mock(UserModel) { getId() >> 'u-1'; getEmail() >> 'jordan@gmail.com' }
        def session = Stub(KeycloakSession) { getTransactionManager() >> Stub(KeycloakTransactionManager) }

        when:
        mapper.importNewUser(session, Stub(RealmModel), user, new IdentityProviderMapperModel(), brokered('jordan@gmail.com', [email_verified: true]))

        then:
        0 * user.setEmailVerified(_)
    }

    def "a provider that does not vouch for the email leaves the new user unverified"() {
        given:
        def user = userWithEmail('jordan@gmail.com')

        when:
        importThenCommit(user, 'jordan@gmail.com', claims)

        then:
        0 * user.setEmailVerified(_)

        where:
        claims << [[email_verified: false], [:], [email_verified: 'no']]
    }

    def "the flag is not given to a user created with another address than the one the provider vouched for"() {
        given:
        def user = userWithEmail('someone-else@example.com')

        when:
        importThenCommit(user, 'jordan@gmail.com', [email_verified: true])

        then:
        0 * user.setEmailVerified(_)
    }

    def "the mapper only imports (it never rewrites an account on later sign-ins) and fits the Google and OIDC providers"() {
        expect:
        mapper.supportsSyncMode(IdentityProviderSyncMode.IMPORT)
        !mapper.supportsSyncMode(IdentityProviderSyncMode.FORCE)
        !mapper.supportsSyncMode(IdentityProviderSyncMode.LEGACY)
        mapper.compatibleProviders as Set == ['google', 'oidc'] as Set
        mapper.id == 'sc-email-verified-importer'
    }
}
