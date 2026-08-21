import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import type { SportResponse } from '@/shared/types/sport';
import {
  buildUpdatePayload,
  toSportFieldsDraft,
  type SportFieldsDraft,
} from '../sportFieldsDraft';
import type { UpdateSportPayload } from '../useUpdateSport';

export interface SportFieldsFormProps {
  sport: SportResponse;
  onSave: (payload: UpdateSportPayload) => void;
  isSaving: boolean;
  errorMessage: string | null;
  /** Cleared by the page when a different sport is selected, so a stale "Saved" never lingers. */
  isSaved: boolean;
  /**
   * ADMIN-4: reports this form's dirty state upward so `/admin`'s logout can warn before
   * discarding it. Optional — the form is fully usable without it, and existing callers
   * that don't care about the guard need no change.
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

/**
 * ADMIN-2 detail panel, sport-fields section. Owns its own draft and its own Save/Reset —
 * the attribute schema is a separate endpoint with a separate Save (see the ticket doc).
 */
export function SportFieldsForm({
  sport,
  onSave,
  isSaving,
  errorMessage,
  isSaved,
  onDirtyChange,
}: SportFieldsFormProps) {
  const [draft, setDraft] = useState<SportFieldsDraft>(() => toSportFieldsDraft(sport));

  // Re-seed when the server hands back a fresh row (a save's invalidate+refetch).
  // Adjusting state during render rather than in an effect — React's own recommended
  // pattern for "a prop changed and some state derived from it must follow", and it
  // avoids the extra commit an effect would cost.
  const [seededFrom, setSeededFrom] = useState(sport);
  if (seededFrom !== sport) {
    setSeededFrom(sport);
    setDraft(toSportFieldsDraft(sport));
  }

  const payload = buildUpdatePayload(sport, draft);
  const isDirty = Object.keys(payload).length > 0;

  // ADMIN-4: report upward on change, and report clean on unmount — a `true` left
  // behind by an unmounted form would keep warning on every later logout attempt.
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const set = <K extends keyof SportFieldsDraft>(key: K, value: SportFieldsDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(payload);
      }}
    >
      <h3 className="text-sm font-semibold text-text-primary">Sport fields</h3>

      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor="sport-name">Name</Label>
          <Input
            id="sport-name"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="sport-category">Category</Label>
          <Input
            id="sport-category"
            value={draft.category}
            onChange={(event) => set('category', event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="sport-description">Description</Label>
          <Textarea
            id="sport-description"
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="sport-icon-url">Icon URL</Label>
          <Input
            id="sport-icon-url"
            value={draft.iconUrl}
            onChange={(event) => set('iconUrl', event.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="sport-min-players">Min players</Label>
            <Input
              id="sport-min-players"
              type="number"
              min={1}
              value={draft.minPlayers}
              onChange={(event) => set('minPlayers', event.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="sport-max-players">Max players</Label>
            <Input
              id="sport-max-players"
              type="number"
              min={1}
              value={draft.maxPlayers}
              onChange={(event) => set('maxPlayers', event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="sport-is-active"
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
            className="size-4 accent-accent-solid"
          />
          <Label htmlFor="sport-is-active" className="mb-0">
            Active
          </Label>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-3 text-2sm text-text-danger">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save fields'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || isSaving}
          onClick={() => setDraft(toSportFieldsDraft(sport))}
        >
          Reset
        </Button>
        {isSaved && !isDirty ? (
          <span role="status" className="text-2sm text-text-secondary">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
