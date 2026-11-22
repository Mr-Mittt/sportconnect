import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { AdminImportPage } from './AdminImportPage';
import type { ImportApplyResult, ImportPreview } from './types';

const game = { winners: ['Hiếu', 'Anh_VL'], losers: ['Bảo'] };
const importFile = {
  sheet: '102026',
  sessions: [{ title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', startTime: '07:00', endTime: '09:00', games: [game] }],
};

const members = [
  { userId: 'u-anh-b', fullName: 'Ánh Vãng Lai' },
  { userId: 'u-bao', fullName: 'Bảo Nguyễn' },
  { userId: 'u-hieu', fullName: 'Hiếu Nguyễn' },
];

const unresolvedPreview: ImportPreview = {
  hostUserId: 'u-bao',
  canApply: false,
  members,
  unresolved: [{ name: 'Anh_VL', candidates: [] }],
  sessions: [{
    title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', scheduledStart: '2026-10-29T00:00:00Z', scheduledEndAt: '2026-10-29T02:00:00Z', exists: false,
    games: [{
      winners: [{ name: 'Hiếu', userId: 'u-hieu', fullName: 'Hiếu Nguyễn' }, { name: 'Anh_VL', userId: null, fullName: null }],
      losers: [{ name: 'Bảo', userId: 'u-bao', fullName: 'Bảo Nguyễn' }],
    }],
  }],
};

const applied: ImportApplyResult = {
  created: 1, skipped: 0, failed: 0,
  results: [{ title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', status: 'CREATED', sessionId: 9 }],
};

function envelope<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AdminImportPage /></QueryClientProvider>);
}

async function upload(content: unknown, name = 'sessions.json') {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  await userEvent.upload(screen.getByLabelText('Import file'), new File([text], name, { type: 'application/json' }));
}

async function fillIds(group = '46', location = '7') {
  await userEvent.type(screen.getByLabelText('Group id'), group);
  await userEvent.type(screen.getByLabelText('Location id'), location);
}

describe('AdminImportPage (CLIENT-ADMIN-IMPORT-1)', () => {
  let post: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    post = vi.spyOn(apiClient, 'post');
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps Preview and Apply disabled until there is a file, a group id and a location id', async () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await upload(importFile);
    await userEvent.type(screen.getByLabelText('Group id'), '46');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Location id'), '7');
    expect(screen.getByText('1 session from sheet 102026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('says why a file is refused and keeps Preview disabled', async () => {
    renderPage();
    await fillIds();
    await upload('not json');
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't valid JSON.");
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    await upload({ nope: true });
    expect(await screen.findByRole('alert')).toHaveTextContent("This isn't an import file made by the sheet script.");
  });

  it('previews with the file, the ids and no aliases, and shows the unresolved name', async () => {
    post.mockResolvedValue(envelope(unresolvedPreview));
    renderPage();
    await upload(importFile);
    await fillIds();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByLabelText('Who is "Anh_VL"?')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/sessions/import/preview', { groupId: 46, locationId: 7, aliases: undefined, sessions: importFile.sessions });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('enables Apply once every unresolved name has a member, and sends the choice as an alias', async () => {
    post.mockResolvedValueOnce(envelope(unresolvedPreview)).mockResolvedValueOnce(envelope(applied));
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await userEvent.selectOptions(await screen.findByLabelText('Who is "Anh_VL"?'), 'u-anh-b');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Imported 1, already imported 0, failed 0.');
    expect(post).toHaveBeenLastCalledWith('/sessions/import', { groupId: 46, locationId: 7, aliases: { Anh_VL: 'u-anh-b' }, sessions: importFile.sessions });
  });

  it('takes the choice back: Apply is disabled again', async () => {
    post.mockResolvedValue(envelope(unresolvedPreview));
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const select = await screen.findByLabelText('Who is "Anh_VL"?');
    await userEvent.selectOptions(select, 'u-anh-b');
    await userEvent.selectOptions(select, '');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('applies straight away when nothing is unresolved', async () => {
    post.mockResolvedValueOnce(envelope({ ...unresolvedPreview, unresolved: [], canApply: true })).mockResolvedValueOnce(envelope(applied));
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled());
    expect(screen.queryByLabelText(/Who is/)).not.toBeInTheDocument();
  });

  it('shows its own message when the preview is refused and keeps the file and the ids', async () => {
    post.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { success: false, message: 'English server text', errorCode: 'GROUP_NOT_FOUND' } } });
    renderPage();
    await upload(importFile);
    await fillIds();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No active group has that id.');
    expect(screen.getByLabelText('Group id')).toHaveValue(46);
    expect(screen.getByText('1 session from sheet 102026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('shows its own message when the apply is refused and keeps the preview and the choices', async () => {
    post.mockResolvedValueOnce(envelope({ ...unresolvedPreview, unresolved: [], canApply: true }))
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { success: false, message: 'Forbidden' } } });
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only an admin can import sessions.');
    expect(screen.getByRole('list', { name: 'Sessions to import' })).toBeInTheDocument();
  });

  it('turns Apply into "Apply again" after a failed session, and disables both buttons while a call runs', async () => {
    let finish: (value: unknown) => void = () => {};
    post.mockResolvedValueOnce(envelope({ ...unresolvedPreview, unresolved: [], canApply: true }))
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    finish(envelope({ created: 0, skipped: 0, failed: 1, results: [{ title: 'T', localDate: '2026-10-29', status: 'FAILED' }] }));
    expect(await screen.findByRole('button', { name: 'Apply again' })).toBeEnabled();
  });

  it('clears the preview and the chosen members when the group id changes', async () => {
    post.mockResolvedValue(envelope(unresolvedPreview));
    renderPage();
    await upload(importFile);
    await fillIds();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await userEvent.selectOptions(await screen.findByLabelText('Who is "Anh_VL"?'), 'u-anh-b');

    await userEvent.type(screen.getByLabelText('Group id'), '1');

    expect(screen.queryByLabelText('Who is "Anh_VL"?')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Sessions to import' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});
