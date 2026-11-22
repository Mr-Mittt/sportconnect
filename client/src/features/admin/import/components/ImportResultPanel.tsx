import type { ImportApplyResult, ImportSessionStatus } from '../types';

const STATUS_LABEL: Record<ImportSessionStatus, string> = {
  CREATED: 'Imported',
  SKIPPED: 'Already imported',
  FAILED: 'Failed',
};

interface ImportResultPanelProps {
  result: ImportApplyResult;
}

/**
 * CLIENT-ADMIN-IMPORT-1: what an apply did: the counts, and one line per session saying whether it was imported, was
 * already there (skipped) or failed. A failed session is the only one that went wrong; the rest were imported, and applying
 * again retries just the failed ones.
 */
export function ImportResultPanel({ result }: ImportResultPanelProps) {
  return (
    <section aria-label="Import result" className="space-y-2">
      <p role="status" className="text-2sm font-medium text-text-primary">
        Imported {result.created}, already imported {result.skipped}, failed {result.failed}.
      </p>
      <ul className="space-y-1 text-2sm">
        {result.results.map((r) => (
          <li key={`${r.localDate}|${r.title}`} className="flex gap-3">
            <span className="shrink-0 text-text-muted">{r.localDate}</span>
            <span className="min-w-0 flex-1 truncate text-text-secondary">{r.title}</span>
            <span className={r.status === 'FAILED' ? 'shrink-0 font-medium text-text-danger' : 'shrink-0 text-text-secondary'}>
              {STATUS_LABEL[r.status]}
            </span>
          </li>
        ))}
      </ul>
      {result.failed > 0 && (
        <p className="text-2xs text-text-muted">
          The failed sessions were not imported. Apply again to retry them; the others will be skipped.
        </p>
      )}
    </section>
  );
}
