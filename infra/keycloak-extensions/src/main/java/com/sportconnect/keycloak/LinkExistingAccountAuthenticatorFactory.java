package com.sportconnect.keycloak;

import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.authenticators.broker.IdpEmailVerificationAuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;

public class LinkExistingAccountAuthenticatorFactory extends IdpEmailVerificationAuthenticatorFactory {

    public static final String ID = "sc-link-existing-account";

    private static final AuthenticationExecutionModel.Requirement[] REQUIREMENTS = {
            AuthenticationExecutionModel.Requirement.REQUIRED,
            AuthenticationExecutionModel.Requirement.DISABLED
    };

    @Override
    public Authenticator create(KeycloakSession session) {
        return new LinkExistingAccountAuthenticator();
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "SportConnect Link Existing Account (password or email)";
    }

    @Override
    public String getHelpText() {
        return "One page to prove a social sign-in belongs to the existing account: its password or an emailed link (A29).";
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return REQUIREMENTS;
    }
}
