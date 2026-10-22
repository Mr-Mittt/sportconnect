import type { Preview } from '@storybook/react-vite';

// Same locale toolbar as the client's Storybook (CLIENT-I18N-1): every page reviewable in vi.
const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Page language',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'vi', title: 'Tiếng Việt' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'en' },
};

export default preview;
