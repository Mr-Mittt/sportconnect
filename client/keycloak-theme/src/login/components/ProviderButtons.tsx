import { IconBrandFacebook, IconBrandGoogle, IconWorld } from '@tabler/icons-react';
import { kcSanitize } from 'keycloakify/lib/kcSanitize';
import { Button } from '@/shared/ui/button';
import type { I18n } from '../i18n';

interface Provider {
  alias: string;
  loginUrl: string;
  displayName: string;
}

/** Zalo has no Tabler brand icon: a small inline mark, chosen by the provider alias. */
function ZaloMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 items-center justify-center rounded-[4px] bg-accent-solid text-[9px] font-bold text-white"
    >
      Z
    </span>
  );
}

function ProviderIcon({ alias }: { alias: string }) {
  switch (alias) {
    case 'google':
      return <IconBrandGoogle className="size-4" aria-hidden="true" />;
    case 'facebook':
      return <IconBrandFacebook className="size-4" aria-hidden="true" />;
    case 'zalo':
      return <ZaloMark />;
    default:
      return <IconWorld className="size-4" aria-hidden="true" />;
  }
}

interface ProviderButtonsProps {
  providers: Provider[];
  i18n: I18n;
}

/**
 * "or" divider plus one outline button per identity provider the realm offers. Keycloak only needs
 * the provider alias; the label comes from the theme (`continueWith`), the icon from the alias.
 */
export function ProviderButtons({ providers, i18n }: ProviderButtonsProps) {
  const { msgStr } = i18n;
  if (providers.length === 0) return null;
  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <div className="border-hairline-t flex-1 border-border" />
        <span className="text-xs text-text-muted">{msgStr('or')}</span>
        <div className="border-hairline-t flex-1 border-border" />
      </div>
      <ul id="kc-social-providers" className="flex flex-col gap-2.5">
        {providers.map((provider) => (
          <li key={provider.alias}>
            <Button asChild variant="outline" className="w-full">
              <a id={`social-${provider.alias}`} href={provider.loginUrl}>
                <ProviderIcon alias={provider.alias} />
                <span
                  dangerouslySetInnerHTML={{
                    __html: msgStr('continueWith', kcSanitize(provider.displayName)),
                  }}
                />
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
