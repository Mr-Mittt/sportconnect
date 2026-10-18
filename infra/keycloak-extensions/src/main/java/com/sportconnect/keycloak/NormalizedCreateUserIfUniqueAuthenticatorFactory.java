package com.sportconnect.keycloak;

import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.authenticators.broker.IdpCreateUserIfUniqueAuthenticatorFactory;
import org.keycloak.models.KeycloakSession;

public class NormalizedCreateUserIfUniqueAuthenticatorFactory extends IdpCreateUserIfUniqueAuthenticatorFactory {

    public static final String ID = "sc-create-user-if-unique-normalized";

    private static final NormalizedCreateUserIfUniqueAuthenticator INSTANCE = new NormalizedCreateUserIfUniqueAuthenticator();

    @Override
    public Authenticator create(KeycloakSession session) {
        return INSTANCE;
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "SportConnect Create User If Unique (normalized email)";
    }

    @Override
    public String getHelpText() {
        return "Create User If Unique that also finds an existing account by the normalized email (A35).";
    }
}
