package com.sportconnect.keycloak.phone;

import jakarta.ws.rs.core.MultivaluedMap;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.browser.UsernamePasswordForm;
import org.keycloak.models.RealmModel;

/**
 * A27: the browser flow's "Username Password Form" that also accepts a phone number. When the typed text is not an
 * email and parses as a phone number, the account holding that E.164 number is looked up and its username is put in
 * the form before Keycloak's own password check runs, so lockout, events and the rest are unchanged. A phone that
 * does not parse, or matches nobody, falls through to the normal "invalid credentials" path.
 */
public class PhoneLoginForm extends UsernamePasswordForm {

    @Override
    protected boolean validateForm(AuthenticationFlowContext context, MultivaluedMap<String, String> formData) {
        String typed = formData.getFirst("username");
        if (typed != null && !typed.contains("@")) {
            String e164 = PhoneRules.toE164(typed);
            if (e164 != null) {
                RealmModel realm = context.getRealm();
                context.getSession().users()
                        .searchForUserByUserAttributeStream(realm, PhoneRules.ATTRIBUTE, e164)
                        .findFirst()
                        .ifPresent(user -> formData.putSingle("username", user.getUsername()));
            }
        }
        return super.validateForm(context, formData);
    }
}
