import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ImportPreviewTable } from './components/ImportPreviewTable';
import { ImportResultPanel } from './components/ImportResultPanel';
import { UnresolvedNamesPanel } from './components/UnresolvedNamesPanel';
import { IMPORT_FILE_PROBLEMS, parseImportFile } from './importFile';
import type { ImportFile, ImportRequest } from './types';
import { useImportApply } from './useImportApply';
import { useImportPreview } from './useImportPreview';

/** The text of a file the admin chose. FileReader (not `Blob.text`) so it also runs where the Blob method is missing. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function positiveInteger(value: string): number | null {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * CLIENT-ADMIN-IMPORT-1: `/admin/import`. The admin uploads the file the sheet script made (SESSION-71), types the group's
 * id and the location's id, and previews: every session with its games and the members the names matched. A name nobody
 * (or several people) matched gets a dropdown of the group's members; the apply stays disabled until each has one. Applying
 * creates the finished sessions (SESSION-70); one already there is skipped, so applying again is safe.
 *
 * Everything lives in this page: the file, the ids and the chosen members are not saved, and changing the file or an id
 * clears the preview (the chosen members belong to one group).
 */
export function AdminImportPage() {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const previewCall = useImportPreview();
  const applyCall = useImportApply();

  const group = positiveInteger(groupId);
  const location = positiveInteger(locationId);
  const preview = previewCall.data;
  const unresolvedLeft = preview ? preview.unresolved.filter((u) => !aliases[u.name]) : [];
  const busy = previewCall.isPending || applyCall.isPending;
  const canPreview = file !== null && group !== null && location !== null && !busy;
  const canApply = preview !== undefined && unresolvedLeft.length === 0 && !busy;

  const clearResults = () => {
    previewCall.reset();
    applyCall.reset();
    setAliases({});
  };

  const request = (): ImportRequest | null =>
    file && group !== null && location !== null
      ? {
          groupId: group,
          locationId: location,
          aliases: Object.keys(aliases).length > 0 ? aliases : undefined,
          sessions: file.sessions,
        }
      : null;

  const handleFile = async (chosen: File | undefined) => {
    clearResults();
    if (!chosen) {
      setFile(null);
      setFileProblem(null);
      return;
    }
    const parsed = parseImportFile(await readText(chosen));
    if (parsed.ok) {
      setFile(parsed.file);
      setFileProblem(null);
    } else {
      setFile(null);
      setFileProblem(IMPORT_FILE_PROBLEMS[parsed.problem]);
    }
  };

  const handlePreview = () => {
    const body = request();
    if (!body) return;
    applyCall.reset();
    previewCall.preview(body);
  };

  const handleApply = () => {
    const body = request();
    if (body) applyCall.apply(body);
  };

  const handleChoose = (name: string, userId: string) => {
    applyCall.reset();
    setAliases((current) => {
      const next = { ...current };
      if (userId) next[name] = userId;
      else delete next[name];
      return next;
    });
  };

  const failedBefore = (applyCall.data?.failed ?? 0) > 0;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Import sessions</h2>
        <p className="mt-1 text-2sm text-text-muted">
          Load finished sessions and their games from the file the sheet script made. Players are matched to the members of the
          group by first name.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="import-file">Import file</Label>
          <Input
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="h-auto py-1"
          />
          {file && (
            <p className="mt-1 text-2xs text-text-muted">
              {file.sessions.length} {file.sessions.length === 1 ? 'session' : 'sessions'}
              {file.sheet ? ` from sheet ${file.sheet}` : ''}
            </p>
          )}
          {fileProblem && (
            <p role="alert" className="mt-1 text-2sm text-text-danger">
              {fileProblem}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="import-group">Group id</Label>
          <Input
            id="import-group"
            type="number"
            min={1}
            inputMode="numeric"
            value={groupId}
            onChange={(event) => {
              clearResults();
              setGroupId(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="import-location">Location id</Label>
          <Input
            id="import-location"
            type="number"
            min={1}
            inputMode="numeric"
            value={locationId}
            onChange={(event) => {
              clearResults();
              setLocationId(event.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handlePreview} disabled={!canPreview}>
          {previewCall.isPending ? 'Previewing…' : 'Preview'}
        </Button>
        <Button type="button" onClick={handleApply} disabled={!canApply}>
          {applyCall.isPending ? 'Importing…' : failedBefore ? 'Apply again' : 'Apply'}
        </Button>
      </div>

      {previewCall.errorMessage && (
        <p role="alert" className="text-2sm text-text-danger">
          {previewCall.errorMessage}
        </p>
      )}

      {preview && (
        <div className="space-y-4">
          {preview.unresolved.length > 0 && (
            <UnresolvedNamesPanel
              unresolved={preview.unresolved}
              members={preview.members}
              aliases={aliases}
              onChoose={handleChoose}
            />
          )}
          <ImportPreviewTable sessions={preview.sessions} aliases={aliases} members={preview.members} />
        </div>
      )}

      {applyCall.errorMessage && (
        <p role="alert" className="text-2sm text-text-danger">
          {applyCall.errorMessage}
        </p>
      )}
      {applyCall.data && <ImportResultPanel result={applyCall.data} />}
    </section>
  );
}
