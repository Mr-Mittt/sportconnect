package com.sportconnect.keycloak;

import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

/**
 * A27: after a registration or a profile update, rewrites the stored {@code phoneNumber} to its canonical form
 * ({@link PhoneRules#canonical}); a validator cannot change a value, so this is where {@code 0901234567} becomes
 * {@code +84901234567}. For an account with no email it also gives Keycloak's mandatory internal username the E.164
 * phone (never shown). Registered in the realm's event listeners as {@code sc-phone-normalizer}.
 */
public class PhoneNormalizingEventListener implements EventListenerProvider {

    private final KeycloakSession session;

    PhoneNormalizingEventListener(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void onEvent(Event event) {
        if ((event.getType() != EventType.REGISTER && event.getType() != EventType.UPDATE_PROFILE) || event.getUserId() == null) {
            return;
        }
        RealmModel realm = session.realms().getRealm(event.getRealmId());
        UserModel user = realm == null ? null : session.users().getUserById(realm, event.getUserId());
        if (user == null) {
            return;
        }
        String typed = user.getFirstAttribute(PhoneRules.ATTRIBUTE);
        String canonical = PhoneRules.canonical(typed);
        if (canonical != null && !canonical.equals(typed)) {
            user.setSingleAttribute(PhoneRules.ATTRIBUTE, canonical);
        }
        boolean noEmail = user.getEmail() == null || user.getEmail().isBlank();
        if (noEmail && canonical != null && PhoneRules.isUsableIdentifier(canonical)) {
            user.setUsername(canonical);
        }
    }

    @Override
    public void onEvent(AdminEvent event, boolean includeRepresentation) {
    }

    @Override
    public void close() {
    }
}
