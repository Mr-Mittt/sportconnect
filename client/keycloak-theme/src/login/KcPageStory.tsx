import { createGetKcContextMock } from 'keycloakify/login/KcContext';
import type { DeepPartial } from 'keycloakify/tools/DeepPartial';
import { kcEnvDefaults, themeNames } from '../kc.gen';
import type { KcContext, KcContextExtension, KcContextExtensionPerPage } from './KcContext';
import KcPage from './KcPage';

const kcContextExtension: KcContextExtension = {
  themeName: themeNames[0],
  properties: { ...kcEnvDefaults },
};
const kcContextExtensionPerPage: KcContextExtensionPerPage = {};

export const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension,
  kcContextExtensionPerPage,
  overrides: {},
  overridesPerPage: {},
});

/** The real realm offers exactly these two languages; the mock's default lists all 32 shipped ones. */
const realmLanguages = [
  { languageTag: 'en', label: 'English', url: '#' },
  { languageTag: 'vi', label: 'Tiếng Việt', url: '#' },
];

export type KcPageStoryProps<PageId extends KcContext['pageId']> = {
  kcContext?: DeepPartial<Extract<KcContext, { pageId: PageId }>>;
  /** `en` or `vi`, from the Storybook locale toolbar (or `?globals=locale:vi` in a capture URL). */
  locale?: string;
};

export function KcPageStory<PageId extends KcContext['pageId']>(
  props: KcPageStoryProps<PageId> & { pageId: PageId },
) {
  const { pageId, kcContext: overrides, locale = 'en' } = props;
  const kcContext = getKcContextMock({
    pageId,
    overrides: {
      locale: { currentLanguageTag: locale, supported: realmLanguages },
      ...(overrides as object),
    } as never,
  });
  return <KcPage kcContext={kcContext} />;
}
