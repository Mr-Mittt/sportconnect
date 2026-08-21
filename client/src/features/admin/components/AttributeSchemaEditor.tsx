import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import type { SportAttributeSchema } from '@/shared/types/sport';

export interface AttributeSchemaEditorProps {
  /** `null` = the sport offers no attributes yet (a valid backend state, not an error). */
  schema: SportAttributeSchema | null;
  onSave: (schema: SportAttributeSchema) => void;
  isLoading: boolean;
  isSaving: boolean;
  /** Server-side validation text from A9, rendered verbatim. */
  errorMessage: string | null;
  isSaved: boolean;
  /**
   * ADMIN-4: reports this editor's dirty state upward so `/admin`'s logout can warn before
   * discarding it. Optional — the editor is fully usable without it, and existing callers
   * that don't care about the guard need no change.
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

/** The starting document for a sport that has none. Not `{}` — A9's validator rejects a
 * document without a `version` ("Attribute schema must declare a version"), so an empty
 * object would fail on the very first Save for every sport in this state. */
const EMPTY_SCHEMA: SportAttributeSchema = { version: 1, groups: [] };

function toText(schema: SportAttributeSchema | null): string {
  return JSON.stringify(schema ?? EMPTY_SCHEMA, null, 2);
}

/**
 * ADMIN-2 detail panel, attributes section: the whole schema document as plain JSON.
 *
 * A textarea rather than a structured builder is deliberate — see the ticket doc. The two
 * error slots are distinct on purpose: `JSON.parse` failures are caught locally and block
 * the request entirely, while anything the server rejects (unknown type, duplicate key, bad
 * `defaultValue`, size cap) is rendered as returned. A9 is the authority on document
 * validity; its rules are not reimplemented here because they would drift.
 */
export function AttributeSchemaEditor({
  schema,
  onSave,
  isLoading,
  isSaving,
  errorMessage,
  isSaved,
  onDirtyChange,
}: AttributeSchemaEditorProps) {
  const [text, setText] = useState<string>(() => toText(schema));
  const [parseError, setParseError] = useState<string | null>(null);

  // Re-seed when the fetched document arrives (the first render happens while the query is
  // still pending) and again when a save's invalidate+refetch returns. Adjusting state
  // during render rather than in an effect — React's own recommended pattern for "a prop
  // changed and some state derived from it must follow", and it avoids the extra commit.
  const [seededFrom, setSeededFrom] = useState(schema);
  if (seededFrom !== schema) {
    setSeededFrom(schema);
    setText(toText(schema));
    setParseError(null);
  }

  const isDirty = text !== toText(schema);

  // ADMIN-4: report upward on change, and report clean on unmount — a `true` left
  // behind by an unmounted editor would keep warning on every later logout attempt.
  // Declared above the loading-state return below: hooks cannot sit after it.
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-text-primary">Attributes</h3>
        <p className="mt-2 text-2sm text-text-muted">Loading schema…</p>
      </section>
    );
  }

  const handleSubmit = () => {
    let parsed: SportAttributeSchema;
    try {
      parsed = JSON.parse(text) as SportAttributeSchema;
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Invalid JSON');
      return;
    }
    setParseError(null);
    onSave(parsed);
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-text-primary">Attributes</h3>

      <div className="mt-3">
        <Label htmlFor="attribute-schema">Schema document (JSON)</Label>
        <Textarea
          id="attribute-schema"
          value={text}
          spellCheck={false}
          rows={16}
          onChange={(event) => setText(event.target.value)}
          className="font-mono text-xs"
          aria-describedby={parseError ? 'attribute-schema-parse-error' : undefined}
          aria-invalid={parseError ? true : undefined}
        />
      </div>

      {parseError ? (
        <p
          id="attribute-schema-parse-error"
          role="alert"
          className="mt-2 text-2sm text-text-danger"
        >
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
          {isSaving ? 'Saving…' : 'Save attributes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || isSaving}
          onClick={() => {
            setText(toText(schema));
            setParseError(null);
          }}
        >
          Reset
        </Button>
        {isSaved && !isDirty ? (
          <span role="status" className="text-2sm text-text-secondary">
            Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
