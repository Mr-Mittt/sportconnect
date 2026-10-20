package com.sportconnect.keycloak.email;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.broker.IdpCreateUserIfUniqueAuthenticator;
import org.keycloak.authentication.authenticators.broker.util.ExistingUserInfo;
import org.keycloak.authentication.authenticators.broker.util.SerializedBrokeredIdentityContext;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.models.UserModel;

/**
 * A35: Keycloak's "Create User If Unique" step of the first broker login, widened with the normalized email. The stock
 * check finds an existing user by the exact username or email; when it finds none, this also looks for a user whose
 * {@code email_normalized} equals the identity provider's email ({@link EmailRules}), so a Google sign-in as
 * {@code jordanleesmith@gmail.com} meets the password account registered as {@code jordan.lee.smith@gmail.com}.
 * A match is reported exactly like the stock one: the flow goes on to "Handle Existing Account", whose confirmation
 * (an emailed link to the existing address, or its password) is what links the accounts, never a silent link.
 */
public class NormalizedCreateUserIfUniqueAuthenticator extends IdpCreateUserIfUniqueAuthenticator {

    @Override
    protected ExistingUserInfo checkExistingUser(AuthenticationFlowContext context, String username,
            SerializedBrokeredIdentityContext serialized, BrokeredIdentityContext brokerContext) {
        ExistingUserInfo exact = super.checkExistingUser(context, username, serialized, brokerContext);
        if (exact != null) {
            return exact;
        }
        String key = EmailRules.normalized(brokerContext.getEmail());
        if (key == null || context.getRealm().isDuplicateEmailsAllowed()) {
            return null;
        }
        return context.getSession().users()
                .searchForUserByUserAttributeStream(context.getRealm(), EmailRules.ATTRIBUTE, key)
                .findFirst()
                .map(other -> new ExistingUserInfo(other.getId(), UserModel.EMAIL, other.getEmail()))
                .orElse(null);
    }
}
