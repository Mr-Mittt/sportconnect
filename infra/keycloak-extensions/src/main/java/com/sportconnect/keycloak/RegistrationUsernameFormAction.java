package com.sportconnect.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;

import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

/**
 * A27: the username of a new account is the identifier it registers with. The realm does not use "email as username"
 * (that setting makes an email mandatory and so rules out a phone-only account), so this runs before Keycloak's
 * "Registration User Profile Creation" and, when the form carries no {@code username}, sets it to the email, else to
 * the canonical phone ({@link PhoneRules#canonical}). The register page does not have to send a username. A form that
 * has neither is left alone: Keycloak's own validation and {@code sc-email-or-phone} then refuse it.
 */
public class RegistrationUsernameFormAction implements FormAction {

    @Override
    public void buildPage(FormContext context, LoginFormsProvider form) {
    }

    @Override
    public void validate(ValidationContext context) {
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        String username = form.getFirst("username");
        if (username == null || username.isBlank()) {
            String email = form.getFirst("email");
            String phone = PhoneRules.canonical(form.getFirst(PhoneRules.ATTRIBUTE));
            if (email != null && !email.isBlank()) {
                form.putSingle("username", email.trim());
            } else if (phone != null && PhoneRules.isUsableIdentifier(phone)) {
                form.putSingle("username", phone);
            }
        }
        context.success();
    }

    @Override
    public void success(FormContext context) {
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public void close() {
    }
}
