import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type {
  SessionAttributeSchema,
  SportAttributeSchema,
  SportResponse,
} from '@/shared/types/sport';
import { AdminSportsPage } from './AdminSportsPage';

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function sport(overrides: Partial<SportResponse> & { id: number; name: string }): SportResponse {
  return {
    description: null,
    category: 'Racket',
    iconUrl: null,
    minPlayers: 2,
    maxPlayers: 4,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const badminton = sport({ id: 1, name: 'Badminton' });
const tennis = sport({ id: 4, name: 'Tennis', isActive: false });

const badmintonSchema: SportAttributeSchema = {
  defaultLocale: 'en',
  groups: [
    {
      key: 'gear',
      label: { en: 'Gear' },
      isAvailable: true,
      attributes: [{ key: 'racketBrand', label: { en: 'Racket brand' }, type: 'STRING' }],
    },
  ],
};

// ADMIN-5: the raw admin session schema — a `#ref` node (pointer at the profile schema) plus an
// own node, the two kinds A17's document mixes.
const badmintonSessionSchema: SessionAttributeSchema = {
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
};

function renderPage(initialPath = '/admin/sports') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/sports" element={<AdminSportsPage />} />
          <Route path="/admin/sports/:sportId" element={<AdminSportsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockGet(
  schema: SportAttributeSchema | null = badmintonSchema,
  sessionSchema: SessionAttributeSchema | null = badmintonSessionSchema,
) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/all') return apiResponse([badminton, tennis]);
    // A11's admin twin — resolves regardless of active state. The member-facing
    // `/sports/{id}/attribute-schema` is deliberately NOT stubbed: a regression pointing
    // the editor back at it would throw here rather than quietly pass.
    if (url === '/sports/all/1/attribute-schema') return apiResponse(schema);
    if (url === '/sports/all/4/attribute-schema') return apiResponse(schema);
    // ADMIN-5 / A17 — the same admin-twin shape for the session schema.
    if (url === '/sports/all/1/session-attribute-schema') return apiResponse(sessionSchema);
    if (url === '/sports/all/4/session-attribute-schema') return apiResponse(sessionSchema);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('AdminSportsPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders every sport, including inactive ones, with all fields', async () => {
    mockGet();
    renderPage();

    const badmintonRow = await screen.findByRole('row', { name: /Badminton/ });
    expect(within(badmintonRow).getByText('Racket')).toBeInTheDocument();
    expect(within(badmintonRow).getByText('2–4')).toBeInTheDocument();
    expect(within(badmintonRow).getByText('Active')).toBeInTheDocument();

    // The inactive sport is listed — that is the whole reason this screen reads
    // /sports/all rather than the public, active-only /sports.
    const tennisRow = screen.getByRole('row', { name: /Tennis/ });
    expect(within(tennisRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('opens the detail panel from the Show detail button', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show detail for Badminton' }));

    expect(await screen.findByLabelText('Name')).toHaveValue('Badminton');
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
  });

  it('deep-links straight into a sport from the URL', async () => {
    mockGet();
    renderPage('/admin/sports/1');

    expect(await screen.findByLabelText('Name')).toHaveValue('Badminton');
  });

  it('sends only the fields that actually changed', async () => {
    mockGet();
    const putSpy = vi
      .spyOn(apiClient, 'put')
      .mockResolvedValue(apiResponse({ ...badminton, name: 'Badminton II' }));
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const nameInput = await screen.findByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Badminton II');
    await user.click(screen.getByRole('button', { name: 'Save fields' }));

    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    // Not category/description/minPlayers/… — untouched columns are left alone,
    // which matters because updateSport is null-means-skip server-side.
    expect(putSpy).toHaveBeenCalledWith('/sports/1', { name: 'Badminton II' });
  });

  it('renders the server message verbatim when a field save is rejected', async () => {
    mockGet();
    vi.spyOn(apiClient, 'put').mockRejectedValue({
      isAxiosError: true,
      response: {
        data: { success: false, message: 'Sport name must be between 2 and 100 characters', data: null, timestamp: '' },
      },
    });
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const nameInput = await screen.findByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'X');
    await user.click(screen.getByRole('button', { name: 'Save fields' }));

    expect(
      await screen.findByText('Sport name must be between 2 and 100 characters'),
    ).toBeInTheDocument();
  });

  it('loads the attribute schema into the textarea', async () => {
    mockGet();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Schema document (JSON)');
    expect(JSON.parse((textarea as HTMLTextAreaElement).value)).toEqual(badmintonSchema);
  });

  it('prefills an empty document with a defaultLocale for a sport with no schema', async () => {
    // A9 returns data: null for "offers no attributes" — a valid state, not an error.
    mockGet(null);
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Schema document (JSON)');
    // Not `{}` — the validator rejects a document with no defaultLocale, so an empty
    // object would fail on the very first save.
    expect(JSON.parse((textarea as HTMLTextAreaElement).value)).toEqual({
      defaultLocale: 'en',
      groups: [],
    });
  });

  it('blocks submit on invalid JSON and fires no request', async () => {
    mockGet();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Schema document (JSON)');
    await user.clear(textarea);
    // paste, not type — userEvent.type reads `{` and `[` as key descriptors.
    await user.click(textarea);
    await user.paste('{ not json');
    await user.click(screen.getByRole('button', { name: 'Save attributes' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("renders A9's validation message verbatim when the schema is rejected", async () => {
    mockGet();
    vi.spyOn(apiClient, 'put').mockRejectedValue({
      isAxiosError: true,
      response: {
        data: { success: false, message: 'Duplicate group key: gear', data: null, timestamp: '' },
      },
    });
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{"version":1,"groups":[]}');
    await user.click(screen.getByRole('button', { name: 'Save attributes' }));

    expect(await screen.findByText('Duplicate group key: gear')).toBeInTheDocument();
  });

  it('edits an inactive sport exactly like an active one (A11)', async () => {
    // Before A11 this was the special case: the member-facing GET 404'd for a deactivated
    // sport while the PUT accepted one, so the editor had to skip the request and explain
    // itself. A11's admin twin resolves regardless of active state, so there is no longer
    // anything special about this sport.
    const getSpy = mockGet();
    renderPage('/admin/sports/4');

    expect(await screen.findByLabelText('Name')).toHaveValue('Tennis');
    expect(screen.getByRole('checkbox', { name: 'Active' })).not.toBeChecked();

    const textarea = await screen.findByLabelText('Schema document (JSON)');
    expect(JSON.parse((textarea as HTMLTextAreaElement).value)).toEqual(badmintonSchema);

    // Reads the admin path, never the active-only member one.
    expect(getSpy).toHaveBeenCalledWith('/sports/all/4/attribute-schema');
  });

  // ─── ADMIN-5: session attribute schema editor ────────────────────────────────

  it('loads the raw session schema into its own textarea via the admin path', async () => {
    const getSpy = mockGet();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    expect(JSON.parse((textarea as HTMLTextAreaElement).value)).toEqual(badmintonSessionSchema);
    // The admin twin (raw, all-locale, active-state-agnostic), not the member GET.
    expect(getSpy).toHaveBeenCalledWith('/sports/all/1/session-attribute-schema');
  });

  it('prefills an empty session document with a defaultLocale when the sport has none', async () => {
    mockGet(badmintonSchema, null);
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    expect(JSON.parse((textarea as HTMLTextAreaElement).value)).toEqual({
      defaultLocale: 'en',
      groups: [],
    });
  });

  it('saves the session schema to its own endpoint', async () => {
    mockGet();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{"defaultLocale":"en","groups":[]}');
    await user.click(screen.getByRole('button', { name: 'Save session attributes' }));

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/sports/1/session-attribute-schema', {
        defaultLocale: 'en',
        groups: [],
      }),
    );
  });

  it("renders A17's validation message verbatim when the session schema is rejected", async () => {
    mockGet();
    vi.spyOn(apiClient, 'put').mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          success: false,
          message: '#ref "gear/racketBrandX" does not resolve to an available profile attribute',
          data: null,
          timestamp: '',
        },
      },
    });
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{"defaultLocale":"en","groups":[]}');
    await user.click(screen.getByRole('button', { name: 'Save session attributes' }));

    expect(
      await screen.findByText(
        '#ref "gear/racketBrandX" does not resolve to an available profile attribute',
      ),
    ).toBeInTheDocument();
  });

  it('blocks a session save on invalid JSON and fires no request', async () => {
    mockGet();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{ not json');
    await user.click(screen.getByRole('button', { name: 'Save session attributes' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();
  });

  // ─── ADMIN-5: collapsible sections ───────────────────────────────────────────

  it('collapses a section without unmounting its editor', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const toggle = await screen.findByRole('button', { name: 'Session attributes' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Still mounted (forceMount) — collapsing must not tear down an in-progress edit.
    expect(screen.getByLabelText('Session schema document (JSON)')).toBeInTheDocument();
  });

  it('keeps an edited session document while its section is collapsed', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{"defaultLocale":"en","groups":[],"edited":true}');

    const toggle = screen.getByRole('button', { name: 'Session attributes' });
    await user.click(toggle); // collapse
    await user.click(toggle); // re-expand

    expect(screen.getByLabelText('Session schema document (JSON)')).toHaveValue(
      '{"defaultLocale":"en","groups":[],"edited":true}',
    );
  });

  // ─── ADMIN-5: read-only viewer ───────────────────────────────────────────────

  it('opens a read-only viewer showing the pretty-printed document', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    await screen.findByLabelText('Session schema document (JSON)');
    // Two "View" buttons (one per schema editor) — the session one is inside its section.
    const sessionSection = screen.getByRole('button', { name: 'Session attributes' }).closest('div');
    await user.click(within(sessionSection as HTMLElement).getByRole('button', { name: 'View' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Session attributes — read-only')).toBeInTheDocument();
    // Pretty-printed (indented), and read-only — no editable control inside.
    expect(within(dialog).getByText(/"defaultLocale": "en"/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('falls back to raw text in the viewer when the document is invalid JSON', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage('/admin/sports/1');

    const textarea = await screen.findByLabelText('Session schema document (JSON)');
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{ not json');

    const sessionSection = screen.getByRole('button', { name: 'Session attributes' }).closest('div');
    await user.click(within(sessionSection as HTMLElement).getByRole('button', { name: 'View' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Couldn.t format . invalid JSON/)).toBeInTheDocument();
    expect(within(dialog).getByText('{ not json')).toBeInTheDocument();
  });
});
