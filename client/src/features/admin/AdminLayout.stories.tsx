import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AdminIndex } from './AdminIndex';
import { AdminLayout } from './AdminLayout';

/**
 * AdminLayout renders an <Outlet />, so every story supplies its own router —
 * there is no global router decorator in .storybook/preview.ts, and adding one
 * for a single component would change the setup for every other story.
 *
 * ProtectedRoute is deliberately not in the tree here: these stories are about
 * how the shell looks, and the guard's behaviour is covered by
 * AdminLayout.test.tsx against the real route tree.
 */
const meta = {
  title: 'Admin/AdminLayout',
  component: AdminLayout,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

function renderWithChild(child: React.ReactNode) {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <AdminLayout />, children: [{ index: true, element: child }] }],
    { initialEntries: ['/admin'] },
  );
  return <RouterProvider router={router} />;
}

/** How `/admin` looks today: the shell plus the index's empty state. */
export const IndexEmptyState: Story = {
  render: () => renderWithChild(<AdminIndex />),
};

/** How the shell frames a real admin section once one exists (ADMIN-2 is first). */
export const WithChildRoute: Story = {
  render: () =>
    renderWithChild(
      <section>
        <h2 className="text-lg font-semibold text-text-primary">Sport attribute schemas</h2>
        <p className="mt-2 text-2sm text-text-muted">
          Placeholder standing in for an admin section&apos;s own content.
        </p>
      </section>,
    ),
};
