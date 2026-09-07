import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

export interface AttributeSchemaEditorProps<T extends object> {
  /** `null` = the sport offers no attributes yet (a valid backend state, not an error). */
  schema: T | null;
  onSave: (schema: T) => void;
  isLoading: boolean;
  isSaving: boolean;
  /** Server-side validation text, rendered verbatim (A9 for the profile schema, A17 for session). */
  errorMessage: string | null;
  isSaved: boolean;
  /**
   * ADMIN-4: reports this editor's dirty state upward so `/admin`'s logout can warn before
   * discarding it. Optional — the editor is fully usable without it, and existing callers
   * that don't care about the guard need no change.
   */
  onDirtyChange?: (isDirty: boolean) => void;
  /**
   * ADMIN-5: the starting document for a sport that has none. Not `{}` — the validator rejects a
   * document without a `defaultLocale` (every labeled node must carry an entry for it, A13), so an
   * empty object would fail on the very first Save. Defaults to the shape both the profile and
   * session schemas share; a caller only overrides it if that ever diverges.
   */
  emptyDocument?: T;
  /**
   * ADMIN-5: DOM-id stem for the textarea, its `<Label htmlFor>`, and the parse-error node.
   * Distinct per instance so two editors can coexist on one page. Defaults to the profile
   * editor's original id.
   */
  fieldId?: string;
  /** ADMIN-5: the field's visible label. Defaults to the profile editor's original text. */
  fieldLabel?: string;
  /** ADMIN-5: the Save button's label. Defaults to the profile editor's original text. */
  saveLabel?: string;
  /** ADMIN-5: title shown in the read-only viewer dialog (suffixed " — read-only"). */
  viewerTitle?: string;
}

const DEFAULT_EMPTY_DOCUMENT = { defaultLocale: 'en', groups: [] };

function toText(schema: object | null, emptyDocument: object): string {
  return JSON.stringify(schema ?? emptyDocument, null, 2);
}

function formatForViewer(text: string): { body: string; invalid: boolean } {
  try {
    return { body: JSON.stringify(JSON.parse(text) as unknown, null, 2), invalid: false };
  } catch {
    return { body: text.trim(), invalid: true };
  }
}

interface SchemaViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
}

/**
 * ADMIN-5: a read-only, pretty-printed view of the current document. The detail panel's textarea
 * is cramped at ~24rem wide; this shows the whole schema in a wide, scrollable pane without a
 * structured editor (still V1's ADMIN-3). No editing, no Save — the textarea remains the only
 * write path. Falls back to the raw text when it does not parse, so it is useful mid-edit too.
 */
function SchemaViewerDialog({ open, onOpenChange, title, text }: SchemaViewerDialogProps) {
  const { body, invalid } = formatForViewer(text);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[40rem]" fixedHeight fixedHeightVh={72}>
        <DialogHeader title={`${title} — read-only`} className="border-b border-border p-4" />
        {invalid ? (
          <p className="px-4 pt-3 text-2sm text-text-muted">
            Couldn&rsquo;t format — invalid JSON. Showing raw text.
          </p>
        ) : null}
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre p-4 font-mono text-xs text-text-primary">
          {body}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ADMIN-2 / ADMIN-5 detail panel: a whole schema document as plain JSON.
 *
 * A textarea rather than a structured builder is deliberate — see the ticket doc. The two
 * error slots are distinct on purpose: `JSON.parse` failures are caught locally and block
 * the request entirely, while anything the server rejects (unknown type, duplicate key, bad
 * `defaultValue`, dangling `#ref`, size cap) is rendered as returned. The server is the
 * authority on document validity; its rules are not reimplemented here because they would drift.
 *
 * Generic over the document type (ADMIN-5): mounted once for the profile schema
 * (`SportAttributeSchema`) and once for the session schema (`SessionAttributeSchema`). The
 * component never reads a field off the document — it round-trips JSON — so the type only flows
 * through `schema`/`onSave`/`emptyDocument`.
 */
export function AttributeSchemaEditor<T extends object>({
  schema,
  onSave,
  isLoading,
  isSaving,
  errorMessage,
  isSaved,
  onDirtyChange,
  emptyDocument = DEFAULT_EMPTY_DOCUMENT as unknown as T,
  fieldId = 'attribute-schema',
  fieldLabel = 'Schema document (JSON)',
  saveLabel = 'Save attributes',
  viewerTitle = 'Attributes',
}: AttributeSchemaEditorProps<T>) {
  const [text, setText] = useState<string>(() => toText(schema, emptyDocument));
  const [parseError, setParseError] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Re-seed when the fetched document arrives (the first render happens while the query is
  // still pending) and again when a save's invalidate+refetch returns. Adjusting state
  // during render rather than in an effect — React's own recommended pattern for "a prop
  // changed and some state derived from it must follow", and it avoids the extra commit.
  const [seededFrom, setSeededFrom] = useState(schema);
  if (seededFrom !== schema) {
    setSeededFrom(schema);
    setText(toText(schema, emptyDocument));
    setParseError(null);
  }

  const isDirty = text !== toText(schema, emptyDocument);

  // ADMIN-4: report upward on change, and report clean on unmount — a `true` left
  // behind by an unmounted editor would keep warning on every later logout attempt.
  // Declared above the loading-state return below: hooks cannot sit after it.
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  if (isLoading) {
    return <p className="text-2sm text-text-muted">Loading schema…</p>;
  }

  const parseErrorId = `${fieldId}-parse-error`;

  const handleSubmit = () => {
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Invalid JSON');
      return;
    }
    setParseError(null);
    onSave(parsed);
  };

  return (
    <section>
      <div>
        <Label htmlFor={fieldId}>{fieldLabel}</Label>
        <Textarea
          id={fieldId}
          value={text}
          spellCheck={false}
          rows={16}
          onChange={(event) => setText(event.target.value)}
          className="font-mono text-xs"
          aria-describedby={parseError ? parseErrorId : undefined}
          aria-invalid={parseError ? true : undefined}
        />
      </div>

      {parseError ? (
        <p id={parseErrorId} role="alert" className="mt-2 text-2sm text-text-danger">
          Invalid JSON — {parseError}
        </p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="mt-2 text-2sm text-text-danger">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!isDirty || isSaving}
          onClick={handleSubmit}
        >
          {isSaving ? 'Saving…' : saveLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || isSaving}
          onClick={() => {
            setText(toText(schema, emptyDocument));
            setParseError(null);
          }}
        >
          Reset
        </Button>
        <Button type="button" variant="outline" onClick={() => setIsViewerOpen(true)}>
          View
        </Button>
        {isSaved && !isDirty ? (
          <span role="status" className="text-2sm text-text-secondary">
            Saved
          </span>
        ) : null}
      </div>

      <SchemaViewerDialog
        open={isViewerOpen}
        onOpenChange={setIsViewerOpen}
        title={viewerTitle}
        text={text}
      />
    </section>
  );
}
