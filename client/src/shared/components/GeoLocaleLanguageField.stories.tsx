import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LanguageResponse } from '@/shared/types/reference';
import { GeoLocaleLanguageField } from './GeoLocaleFields';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];

/** CLIENT-REF-1/CLIENT-REF-2: one of `GeoLocaleFields.tsx`'s split field components — see that
 * file's module doc for why it's no longer one fixed-layout component. */
const meta = {
  title: 'Shared/GeoLocaleFields/Language',
  component: GeoLocaleLanguageField,
  args: {
    languages,
    isReferenceError: false,
    languageCode: null,
    onLanguageChange: () => {},
  },
} satisfies Meta<typeof GeoLocaleLanguageField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PreFilled: Story = {
  args: { languageCode: 'vi' },
};

export const ReferenceLoadError: Story = {
  args: { isReferenceError: true },
};
