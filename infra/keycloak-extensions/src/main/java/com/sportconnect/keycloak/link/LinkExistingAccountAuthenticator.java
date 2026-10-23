package com.sportconnect.keycloak.link;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.Objects;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.broker.IdpEmailVerificationAuthenticator;
import org.keycloak.authentication.authenticators.broker.util.SerializedBrokeredIdentityContext;
import org.keycloak.authentication.authenticators.browser.AbstractUsernameFormAuthenticator;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.models.Constants;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.credential.CredentialModel;
import org.keycloak.models.credential.PasswordCredentialModel;
import org.keycloak.protocol.oidc.OIDCLoginProtocol;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * A29: the single step that proves a social sign-in belongs to the existing account with the same email. It replaces
 * Keycloak's "Confirm link existing account" page, whose two buttons ("Review profile" and "Add to existing account")
 * confused users, and the "Account verification options" subflow behind it.
 *
 * <p>One page offers the two proofs side by side: the account's password (checked here) or a verification link emailed
 * to the existing address (Keycloak's own action-token mechanism, reused through {@link IdpEmailVerificationAuthenticator}
 * so the link, its expiry and the "link clicked in another browser" handling are the stock ones). The email-sent page
 * has a resend that waits {@value #RESEND_SECONDS} seconds and a way back to the login with the email pre-filled.
 * Either proof ends the step with the existing user set; Keycloak then links the identity, never before.
 *
 * <p>A33: an account nobody has proved the mailbox of may have been registered by someone else with this address and their
 * own password (registration does not verify the email). The emailed link proves the mailbox to the person it was sent
 * to, who is then given the account, so a link-by-email proof on an account that was <em>not</em> verified when the email
 * was sent also removes that account's password credential and ends its sessions; the user sets a new password through
 * "forgot password". The password proof never removes anything: it proves the account is the user's, and when the provider
 * also says the mailbox is verified the email is marked verified ({@link #markVerifiedWhenProviderVouches}); a link on an
 * already verified account leaves it as it is.
 * The link click itself marks the email verified (Keycloak's own handler), which is why whether it was unverified is
 * recorded when the email is sent.
 */
public class LinkExistingAccountAuthenticator extends IdpEmailVerificationAuthenticator {

    static final int RESEND_SECONDS = 60;
    static final String SENT_AT_NOTE = "SC_LINK_EMAIL_SENT_AT";
    /** "true" when the existing account's email was already verified at the moment the link was emailed. */
    static final String VERIFIED_AT_SEND_NOTE = "SC_LINK_VERIFIED_AT_SEND";
    static final String ATTRIBUTE = "scLink";

    static final String METHOD = "linkMethod";
    static final String METHOD_PASSWORD = "password";
    static final String METHOD_EMAIL = "email";
    static final String METHOD_RESEND = "resend";

    private final PasswordChecker passwordChecker = new PasswordChecker();

    @Override
    protected void authenticateImpl(AuthenticationFlowContext context, SerializedBrokeredIdentityContext serializedCtx,
            BrokeredIdentityContext brokerContext) {
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        UserModel existing = existingUser(context);
        boolean linkClicked = Objects.equals(authSession.getAuthNote(VERIFY_ACCOUNT_IDP_USERNAME), brokerContext.getUsername());
        boolean emailSent = existing.getEmail() != null
                && Objects.equals(authSession.getAuthNote(Constants.VERIFY_EMAIL_KEY), existing.getEmail());
        if (linkClicked || emailSent) {
            if (linkClicked && wasUnverifiedAtSend(authSession)) {
                takeOverUnverifiedAccount(context, existing);
            }
            // the stock step succeeds on a clicked link, and shows the "email sent" page again on a page refresh
            super.authenticateImpl(context, serializedCtx, brokerContext);
            return;
        }
        context.challenge(choicePage(context, brokerContext, null));
    }

    @Override
    protected void actionImpl(AuthenticationFlowContext context, SerializedBrokeredIdentityContext serializedCtx,
            BrokeredIdentityContext brokerContext) {
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        String method = form.getFirst(METHOD);
        UserModel existing = existingUser(context);
        AuthenticationSessionModel authSession = context.getAuthenticationSession();

        if (METHOD_EMAIL.equals(method) && emailAvailable(context, existing)) {
            sendEmail(context, serializedCtx, brokerContext, authSession);
        } else if (METHOD_RESEND.equals(method) && emailAvailable(context, existing)) {
            if (resendIn(authSession) > 0) {
                super.authenticateImpl(context, serializedCtx, brokerContext); // too soon: just show the page again
            } else {
                sendEmail(context, serializedCtx, brokerContext, authSession);
            }
        } else if (METHOD_PASSWORD.equals(method) && hasPassword(existing)) {
            if (passwordChecker.validatePassword(context, existing, form, false)) {
                markVerifiedWhenProviderVouches(brokerContext, existing);
                context.setUser(existing);
                context.success();
            }
            // a wrong password has already produced its challenge through PasswordChecker.challenge
        } else {
            context.challenge(choicePage(context, brokerContext, null));
        }
    }

    private void sendEmail(AuthenticationFlowContext context, SerializedBrokeredIdentityContext serializedCtx,
            BrokeredIdentityContext brokerContext, AuthenticationSessionModel authSession) {
        authSession.removeAuthNote(Constants.VERIFY_EMAIL_KEY); // lets the stock step send again
        authSession.setAuthNote(VERIFIED_AT_SEND_NOTE, String.valueOf(existingUser(context).isEmailVerified()));
        authSession.setAuthNote(SENT_AT_NOTE, String.valueOf(System.currentTimeMillis()));
        // "Back to login" restarts the flow; the login page pre-fills its field from login_hint
        authSession.setClientNote(OIDCLoginProtocol.LOGIN_HINT_PARAM, existingUser(context).getEmail());
        super.authenticateImpl(context, serializedCtx, brokerContext);
    }

    @Override
    protected void showEmailSentPage(AuthenticationFlowContext context, BrokeredIdentityContext brokerContext) {
        UserModel existing = existingUser(context);
        Map<String, Object> link = new LinkedHashMap<>();
        link.put("email", existing.getEmail());
        link.put("resendIn", resendIn(context.getAuthenticationSession()));
        link.put("unverified", wasUnverifiedAtSend(context.getAuthenticationSession()));
        Response challenge = context.form()
                .setStatus(Response.Status.OK)
                .setAttribute(LoginFormsProvider.IDENTITY_PROVIDER_BROKER_CONTEXT, brokerContext)
                .setAttribute(ATTRIBUTE, link)
                .setActionUri(context.getActionUrl(context.generateAccessCode()))
                .setExecution(context.getExecution().getId())
                .createIdpLinkEmailPage();
        context.forceChallenge(challenge);
    }

    /**
     * The password proof shows the user holds the account, and the provider's token says the same mailbox is verified, so
     * the email is now proven from both ends: mark it verified. Nothing changes when the provider does not vouch for it
     * ({@code email_verified} absent or false) or the account is already verified.
     */
    static void markVerifiedWhenProviderVouches(BrokeredIdentityContext brokerContext, UserModel existing) {
        if (!existing.isEmailVerified() && VerifiedEmailImporter.providerVouches(brokerContext, existing.getEmail())) {
            existing.setEmailVerified(true);
        }
    }

    /** A missing note (the link was opened in another browser) counts as unverified: the safe side. */
    static boolean wasUnverifiedAtSend(AuthenticationSessionModel authSession) {
        return !"true".equals(authSession.getAuthNote(VERIFIED_AT_SEND_NOTE));
    }

    /**
     * Removes every password credential of {@code existing}, ends its sessions, and marks its email verified (the stock
     * link handler already did; this keeps the rule true when the link was opened somewhere the handler did not mark).
     * Idempotent: a page refresh after the success runs it again with nothing left to remove.
     */
    static void takeOverUnverifiedAccount(AuthenticationFlowContext context, UserModel existing) {
        List<CredentialModel> passwords = existing.credentialManager()
                .getStoredCredentialsByTypeStream(PasswordCredentialModel.TYPE).toList();
        for (CredentialModel password : passwords) {
            existing.credentialManager().removeStoredCredentialById(password.getId());
        }
        context.getSession().sessions().removeUserSessions(context.getRealm(), existing);
        existing.setEmailVerified(true);
    }

    /** The choice page: login-idp-link-confirm.ftl with the options the account actually has. */
    Response choicePage(AuthenticationFlowContext context, BrokeredIdentityContext brokerContext, String errorMessage) {
        UserModel existing = existingUser(context);
        Map<String, Object> link = new LinkedHashMap<>();
        link.put("email", existing.getEmail());
        link.put("hasPassword", hasPassword(existing));
        link.put("emailAvailable", emailAvailable(context, existing));
        link.put("unverified", !existing.isEmailVerified());
        LoginFormsProvider form = context.form()
                .setStatus(Response.Status.OK)
                .setAttribute(LoginFormsProvider.IDENTITY_PROVIDER_BROKER_CONTEXT, brokerContext)
                .setAttribute("idpAlias", brokerContext.getIdpConfig().getAlias())
                .setAttribute(ATTRIBUTE, link)
                .setActionUri(context.getActionUrl(context.generateAccessCode()))
                .setExecution(context.getExecution().getId());
        if (errorMessage != null) {
            form.setError(errorMessage);
        }
        return form.createIdpLinkConfirmLinkPage();
    }

    private static UserModel existingUser(AuthenticationFlowContext context) {
        return getExistingUser(context.getSession(), context.getRealm(), context.getAuthenticationSession());
    }

    private static boolean hasPassword(UserModel user) {
        return user.credentialManager().isConfiguredFor(PasswordCredentialModel.TYPE);
    }

    private static boolean emailAvailable(AuthenticationFlowContext context, UserModel user) {
        return user.getEmail() != null && !context.getRealm().getSmtpConfig().isEmpty();
    }

    /** Seconds until the email can be sent again, 0 when it can. */
    static int resendIn(AuthenticationSessionModel authSession) {
        String sentAt = authSession.getAuthNote(SENT_AT_NOTE);
        if (sentAt == null) {
            return 0;
        }
        long elapsed = (System.currentTimeMillis() - Long.parseLong(sentAt)) / 1000;
        return (int) Math.max(0, RESEND_SECONDS - elapsed);
    }

    /** Keycloak's password check (brute-force protection, events) answering with the choice page when it fails. */
    private final class PasswordChecker extends AbstractUsernameFormAuthenticator {
        @Override
        protected Response challenge(AuthenticationFlowContext context, String error, String field) {
            SerializedBrokeredIdentityContext serialized = SerializedBrokeredIdentityContext.readFromAuthenticationSession(
                    context.getAuthenticationSession(), BROKERED_CONTEXT_NOTE);
            BrokeredIdentityContext brokerContext = serialized.deserialize(context.getSession(), context.getAuthenticationSession());
            return choicePage(context, brokerContext, error);
        }

        @Override
        public void authenticate(AuthenticationFlowContext context) {
            throw new UnsupportedOperationException("only validatePassword is used");
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
    }
}
