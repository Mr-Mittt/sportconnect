package com.sportconnect.keycloak;

import java.util.List;
import org.keycloak.broker.oidc.mappers.AbstractClaimMapper;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.models.IdentityProviderMapperModel;
import org.keycloak.models.AbstractKeycloakTransaction;
import org.keycloak.models.IdentityProviderSyncMode;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.provider.ProviderConfigProperty;

/**
 * A33: a brand-new account created from a social sign-in starts with its email verified when the provider says so
 * ({@code email_verified} true in its token), even though the provider does not "trust the email" (A29: {@code trustEmail}
 * stays false so an existing account is always proven, never silently linked, and Keycloak then ignores the claim).
 *
 * <p>Runs only when Keycloak <em>creates</em> the user ({@code importNewUser}); the first sign-in that links to an existing
 * account never calls it, so an account that already existed keeps whatever it had (unverified stays unverified until the
 * emailed-link proof, see {@link LinkExistingAccountAuthenticator}). The email checked is the one the new user was
 * created with.
 *
 * <p>The flag is written at the end of the transaction ({@code enlistPrepare}), not at once: Keycloak's own first-broker-login
 * code resets {@code emailVerified} for a provider that is not trusted after the mappers have run (seen live: set true in
 * {@code importNewUser}, false again at the REGISTER event that follows within the same request).
 */
public class VerifiedEmailImporter extends AbstractClaimMapper {

    public static final String PROVIDER_ID = "sc-email-verified-importer";
    static final String CLAIM = "email_verified";
    private static final String[] COMPATIBLE_PROVIDERS = {"google", "oidc"};

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String[] getCompatibleProviders() {
        return COMPATIBLE_PROVIDERS;
    }

    @Override
    public String getDisplayCategory() {
        return "Attribute Importer";
    }

    @Override
    public String getDisplayType() {
        return "SportConnect: verified email importer";
    }

    @Override
    public String getHelpText() {
        return "When the account is created from this provider and the provider says the email is verified, mark it verified. "
                + "Never touches an account that already existed.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    @Override
    public boolean supportsSyncMode(IdentityProviderSyncMode syncMode) {
        return syncMode == IdentityProviderSyncMode.IMPORT;
    }

    @Override
    public void importNewUser(KeycloakSession session, RealmModel realm, UserModel user, IdentityProviderMapperModel mapperModel,
            BrokeredIdentityContext context) {
        if (isTrue(getClaimValue(context, CLAIM)) && sameEmail(user.getEmail(), context.getEmail())) {
            String userId = user.getId();
            session.getTransactionManager().enlistPrepare(new AbstractKeycloakTransaction() {
                @Override
                protected void commitImpl() {
                    UserModel created = session.users().getUserById(realm, userId);
                    if (created != null) {
                        created.setEmailVerified(true);
                    }
                }

                @Override
                protected void rollbackImpl() {
                }
            });
        }
    }

    /** The claim is a JSON boolean from Google, and a string from some providers. */
    static boolean isTrue(Object claimValue) {
        if (claimValue instanceof Boolean flag) {
            return flag;
        }
        return claimValue instanceof String text && "true".equalsIgnoreCase(text.trim());
    }

    /** The provider's claim is about the email it sent; only a user created with that same address gets the flag. */
    static boolean sameEmail(String userEmail, String providerEmail) {
        return userEmail != null && providerEmail != null && userEmail.equalsIgnoreCase(providerEmail);
    }
}
