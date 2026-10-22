package com.sportconnect.keycloak;

import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

/**
 * A35: keeps the {@code email_normalized} attribute ({@link EmailRules}) in step with the user's email after a
 * registration, a profile or email update and a first sign-in through an identity provider. The attribute is admin-only
 * in the user profile; this is the only writer besides the backfill. Registered as {@code sc-email-normalizer}.
 */
public class EmailNormalizingEventListener implements EventListenerProvider {

    private final KeycloakSession session;

    EmailNormalizingEventListener(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void onEvent(Event event) {
        EventType type = event.getType();
        boolean relevant = type == EventType.REGISTER || type == EventType.UPDATE_PROFILE
                || type == EventType.UPDATE_EMAIL || type == EventType.IDENTITY_PROVIDER_FIRST_LOGIN;
        if (!relevant || event.getUserId() == null) {
            return;
        }
        RealmModel realm = session.realms().getRealm(event.getRealmId());
        UserModel user = realm == null ? null : session.users().getUserById(realm, event.getUserId());
        if (user != null) {
            apply(user);
        }
    }

    /** Sets or clears {@code email_normalized} from the user's current email; only writes when it changes. */
    static void apply(UserModel user) {
        String key = EmailRules.normalized(user.getEmail());
        String stored = user.getFirstAttribute(EmailRules.ATTRIBUTE);
        if (key == null) {
            if (stored != null) {
                user.removeAttribute(EmailRules.ATTRIBUTE);
            }
        } else if (!key.equals(stored)) {
            user.setSingleAttribute(EmailRules.ATTRIBUTE, key);
        }
    }

    @Override
    public void onEvent(AdminEvent event, boolean includeRepresentation) {
    }

    @Override
    public void close() {
    }
}
