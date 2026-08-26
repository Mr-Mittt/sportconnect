import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportAttributeSchema } from '@/shared/types/sport';
import { AttributeSchemaEditor } from './AttributeSchemaEditor';

const schema: SportAttributeSchema = {
  defaultLocale: 'en',
  groups: [
    {
      key: 'gear',
      label: { en: 'Gear' },
      isAvailable: true,
      order: 1,
      attributes: [
        {
          key: 'racketBrand',
          label: { en: 'Racket brand' },
          type: 'STRING',
          isAvailable: true,
          order: 1,
        },
        {
          key: 'grip',
          label: { en: 'Grip' },
          type: 'ENUM',
          isAvailable: true,
          order: 2,
          options: [
            { value: 'eastern', label: { en: 'Eastern' } },
            { value: 'western', label: { en: 'Western' } },
          ],
        },
      ],
    },
  ],
};

const meta = {
  title: 'Admin/AttributeSchemaEditor',
  component: AttributeSchemaEditor,
  args: {
    schema,
    onSave: () => {},
    isLoading: false,
    isSaving: false,
    errorMessage: null,
    isSaved: false,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border-hairline border-border bg-surface-2 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttributeSchemaEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};

/** A9 returns `data: null` for a sport that offers no attributes — a valid state.
 * The editor prefills a document with a `defaultLocale`, never `{}`, because the
 * validator rejects a document with no `defaultLocale`. */
export const NoSchemaYet: Story = {
  args: { schema: null },
};

export const Saving: Story = {
  args: { isSaving: true },
};

/** Server-side validation text from A9, rendered exactly as returned. */
export const ServerRejected: Story = {
  args: { errorMessage: 'Duplicate group key: gear' },
};

export const Saved: Story = {
  args: { isSaved: true },
};
