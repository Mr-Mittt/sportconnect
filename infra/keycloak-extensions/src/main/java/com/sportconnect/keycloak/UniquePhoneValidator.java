package com.sportconnect.keycloak;

import java.util.List;

import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.userprofile.UserProfileAttributeValidationContext;
import org.keycloak.validate.SimpleValidator;
import org.keycloak.validate.ValidationContext;
import org.keycloak.validate.ValidationError;
import org.keycloak.validate.ValidatorConfig;

/**
 * A27: a phone number may belong to one account. The typed value is canonicalised first ({@link PhoneRules#canonical}),
 * so {@code 0901234567} clashes with a stored {@code +84901234567}; an unparseable number is compared as typed.
 * The user being edited is not a clash with themself. Error message key: {@code phoneNumberAlreadyUsed}.
 */
public class UniquePhoneValidator implements SimpleValidator {

    public static final String ID = "sc-unique-phone";
    public static final String MESSAGE = "phoneNumberAlreadyUsed";

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public ValidationContext validate(Object input, String inputHint, ValidationContext context, ValidatorConfig config) {
        String phone = PhoneRules.canonical(first(input));
        if (phone == null) {
            return context;
        }
        KeycloakSession session = context.getSession();
        RealmModel realm = session.getContext().getRealm();
        String ownId = ownerId(context);
        boolean taken = session.users()
                .searchForUserByUserAttributeStream(realm, PhoneRules.ATTRIBUTE, phone)
                .anyMatch(other -> !other.getId().equals(ownId));
        if (taken) {
            context.addError(new ValidationError(ID, inputHint, MESSAGE));
        }
        return context;
    }

    private static String ownerId(ValidationContext context) {
        if (context instanceof UserProfileAttributeValidationContext up) {
            UserModel user = up.getAttributeContext().getUser();
            return user == null ? null : user.getId();
        }
        return null;
    }

    static String first(Object input) {
        if (input instanceof List<?> list) {
            return list.isEmpty() || list.get(0) == null ? null : list.get(0).toString();
        }
        return input == null ? null : input.toString();
    }
}
