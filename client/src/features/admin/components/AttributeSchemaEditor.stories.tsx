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
      attributes: [
        {
          key: 'racketBrand',
          label: { en: 'Racket brand' },
          type: 'STRING',
          isAvailable: true,
        },
        {
          key: 'grip',
          label: { en: 'Grip' },
          type: 'ENUM',
          isAvailable: true,
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

/** ADMIN-5: the same component mounted for the session schema — distinct `fieldId` (so two
 * editors can share a page), label, Save text, and viewer title. The document shape here is
 * `SessionAttributeSchema` (a `#ref` node plus an own node); the editor round-trips it as JSON
 * and never reads a field off it. */
export const SessionSchema: Story = {
  args: {
    schema: {
      defaultLocale: 'en',
      groups: [
        {
          key: 'match',
          label: { en: 'Match details' },
          isAvailable: true,
          attributes: [
            { '#ref': 'gear/racketBrand' },
            { key: 'format', label: { en: 'Format' }, type: 'STRING', isAvailable: true },
          ],
        },
      ],
    } as unknown as SportAttributeSchema,
    fieldId: 'session-attribute-schema',
    fieldLabel: 'Session schema document (JSON)',
    saveLabel: 'Save session attributes',
    viewerTitle: 'Session attributes',
  },
};
