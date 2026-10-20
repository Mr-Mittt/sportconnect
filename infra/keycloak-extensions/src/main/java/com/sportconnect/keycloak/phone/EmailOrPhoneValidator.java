package com.sportconnect.keycloak.phone;

import org.keycloak.userprofile.AttributeContext;
import org.keycloak.userprofile.UserProfileAttributeValidationContext;
import org.keycloak.validate.SimpleValidator;
import org.keycloak.validate.ValidationContext;
import org.keycloak.validate.ValidationError;
import org.keycloak.validate.ValidatorConfig;

/**
 * A27: an account needs an email or a phone. Put on both {@code email} and {@code phoneNumber}; it reads the other
 * attribute from the same profile. The phone counts only when it parses ({@link PhoneRules#isUsableIdentifier}): the
 * backend does not accept an {@code INVALID} phone as an identifier (U25), so a phone-only account with one would
 * fail its first sign-in. Error message key: {@code emailOrPhoneRequired}.
 */
public class EmailOrPhoneValidator implements SimpleValidator {

    public static final String ID = "sc-email-or-phone";
    public static final String MESSAGE = "emailOrPhoneRequired";

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public ValidationContext validate(Object input, String inputHint, ValidationContext context, ValidatorConfig config) {
        AttributeContext attributeContext = context instanceof UserProfileAttributeValidationContext up ? up.getAttributeContext() : null;
        if (attributeContext == null) {
            return context;
        }
        AttributeContext ac = attributeContext;
        String email = ac.getAttributes().getFirst("email");
        String phone = ac.getAttributes().getFirst(PhoneRules.ATTRIBUTE);
        boolean hasEmail = email != null && !email.isBlank();
        if (!hasEmail && !PhoneRules.isUsableIdentifier(phone)) {
            context.addError(new ValidationError(ID, inputHint, MESSAGE));
        }
        return context;
    }
}
