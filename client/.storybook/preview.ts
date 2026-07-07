import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
  },
};

export default preview;
