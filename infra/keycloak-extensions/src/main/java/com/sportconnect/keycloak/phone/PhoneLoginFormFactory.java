package com.sportconnect.keycloak.phone;

import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.authenticators.browser.UsernamePasswordFormFactory;
import org.keycloak.models.KeycloakSession;

public class PhoneLoginFormFactory extends UsernamePasswordFormFactory {

    public static final String ID = "sc-phone-login-form";

    @Override
    public Authenticator create(KeycloakSession session) {
        return new PhoneLoginForm();
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "SportConnect Username, Email or Phone Password Form";
    }

    @Override
    public String getHelpText() {
        return "Username Password Form that also finds the account by its phone number (A27).";
    }
}
