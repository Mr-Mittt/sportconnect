import type { ExtendKcContext } from 'keycloakify/login';
import type { KcEnvName, ThemeName } from '../kc.gen';

export type KcContextExtension = {
  themeName: ThemeName;
  properties: Record<KcEnvName, string>;
};

/** A29: set by the sc-link-existing-account step (infra/keycloak-extensions, LinkExistingAccountAuthenticator). */
export type KcContextExtensionPerPage = {
  'login-idp-link-confirm.ftl': {
    scLink: { email: string; hasPassword: boolean; emailAvailable: boolean };
  };
  'login-idp-link-email.ftl': {
    scLink: { email: string; resendIn: number };
  };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
