package com.sportconnect.keycloak;

/** The one piece the feature packages share: reading a user-profile validator's input. */
public final class ValidatorInput {

    private ValidatorInput() {
    }

    /**
     * The first value of a validator's input as text: Keycloak hands a validator a single value or a list of values,
     * depending on the attribute. {@code null} for no value.
     */
    public static String first(Object input) {
        if (input instanceof java.util.List<?> list) {
            return list.isEmpty() || list.get(0) == null ? null : list.get(0).toString();
        }
        return input == null ? null : input.toString();
    }
}
