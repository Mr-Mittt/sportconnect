package com.sportconnect.keycloak.link

import org.keycloak.broker.provider.BrokeredIdentityContext
import org.keycloak.models.UserModel
import org.keycloak.representations.JsonWebToken
import spock.lang.Specification
import spock.lang.Unroll

/** A33: a password proof on an existing account marks it verified only when the provider vouches for the same mailbox. */
class LinkExistingAccountPasswordProofSpec extends Specification {

    private static BrokeredIdentityContext brokered(String email, Map claims) {
        def idToken = new JsonWebToken()
        claims.each { key, value -> idToken.setOtherClaims(key as String, value) }
        def context = new BrokeredIdentityContext("sub-1", null)
        context.setEmail(email)
        context.contextData.put('VALIDATED_ID_TOKEN', idToken) // the literal: the class constant would load RESTEasy-dependent provider code
        context
    }

    @Unroll
    def "account '#accountEmail' (verified #alreadyVerified), provider '#providerEmail' with claim #claim -> marked #marked"() {
        given:
        def account = Mock(UserModel) { getEmail() >> accountEmail; isEmailVerified() >> alreadyVerified }

        when:
        LinkExistingAccountAuthenticator.markVerifiedWhenProviderVouches(brokered(providerEmail, claim), account)

        then:
        (marked ? 1 : 0) * account.setEmailVerified(true)

        where:
        accountEmail            | providerEmail         | claim                  | alreadyVerified || marked
        'jdoe@gmail.com'        | 'jdoe@gmail.com'      | [email_verified: true] | false           || true
        'j.doe@gmail.com'       | 'jdoe+shop@gmail.com' | [email_verified: true] | false           || true   // one Gmail mailbox
        'jdoe@gmail.com'        | 'jdoe@googlemail.com' | [email_verified: true] | false           || true
        'jdoe@gmail.com'        | 'jdoe@gmail.com'      | [email_verified: false]| false           || false  // the provider does not vouch
        'jdoe@gmail.com'        | 'jdoe@gmail.com'      | [:]                    | false           || false
        'jdoe@gmail.com'        | 'other@gmail.com'     | [email_verified: true] | false           || false  // another mailbox
        'jdoe@gmail.com'        | 'jdoe@gmail.com'      | [email_verified: true] | true            || false  // nothing to do
        null                    | 'jdoe@gmail.com'      | [email_verified: true] | false           || false
    }
}
