package com.sportconnect.keycloak.email;

import com.sportconnect.keycloak.ValidatorInput;

import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.userprofile.UserProfileAttributeValidationContext;
import org.keycloak.userprofile.UserProfileContext;
import org.keycloak.validate.SimpleValidator;
import org.keycloak.validate.ValidationContext;
import org.keycloak.validate.ValidationError;
import org.keycloak.validate.ValidatorConfig;

/**
 * A35: an email may belong to one account, compared by {@link EmailRules#normalized} so a dotted, {@code +tag} or
 * {@code googlemail.com} spelling of a registered Gmail clashes. The user being edited is not a clash with themself.
 * Error message key: {@code emailAlreadyUsed}.
 *
 * <p>Skipped in the first-broker-login review step ({@code IDP_REVIEW}): there a clash must not be a profile error, it
 * must reach the broker flow's existing-account confirmation ({@link NormalizedCreateUserIfUniqueAuthenticator}).
 */
public class UniqueNormalizedEmailValidator implements SimpleValidator {

    public static final String ID = "sc-unique-email-normalized";
    public static final String MESSAGE = "emailAlreadyUsed";

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public ValidationContext validate(Object input, String inputHint, ValidationContext context, ValidatorConfig config) {
        String key = EmailRules.normalized(ValidatorInput.first(input));
        if (key == null) {
            return context;
        }
        String ownId = null;
        if (context instanceof UserProfileAttributeValidationContext up) {
            if (up.getAttributeContext().getContext() == UserProfileContext.IDP_REVIEW) {
                return context;
            }
            UserModel user = up.getAttributeContext().getUser();
            ownId = user == null ? null : user.getId();
        }
        KeycloakSession session = context.getSession();
        RealmModel realm = session.getContext().getRealm();
        String own = ownId;
        boolean taken = session.users()
                .searchForUserByUserAttributeStream(realm, EmailRules.ATTRIBUTE, key)
                .anyMatch(other -> !other.getId().equals(own));
        if (taken) {
            context.addError(new ValidationError(ID, inputHint, MESSAGE));
        }
        return context;
    }
}
