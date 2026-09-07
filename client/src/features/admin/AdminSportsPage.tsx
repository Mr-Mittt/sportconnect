import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AttributeSchemaEditor } from './components/AttributeSchemaEditor';
import { CollapsibleSection } from './components/CollapsibleSection';
import { SportCatalogTable } from './components/SportCatalogTable';
import { SportFieldsForm } from './components/SportFieldsForm';
import { useAdminOutletContext } from './useAdminOutletContext';
import { useAdminSportCatalog } from './useAdminSportCatalog';
import { useReplaceSessionAttributeSchema } from './useReplaceSessionAttributeSchema';
import { useReplaceSportAttributeSchema } from './useReplaceSportAttributeSchema';
import { useSessionAttributeSchemaAdmin } from './useSessionAttributeSchemaAdmin';
import { useSportAttributeSchema } from './useSportAttributeSchema';
import { useUpdateSport } from './useUpdateSport';

/**
 * ADMIN-2: sport master-detail admin screen.
 *
 * Routed at both `/admin/sports` and `/admin/sports/:sportId` — one component, selection read
 * from the URL via `useParams`. Same shape `/posts/:postId` → `HomeFeedPage` already uses
 * (FEED-12): the table stays mounted while the detail panel gets deep-linking and browser
 * back/forward, which page-local selection state would not.
 *
 * ADMIN-5: the detail panel's three parts (sport fields, profile attribute schema, session
 * attribute schema) are each a collapsible section, and both schema editors are the same
 * generic `AttributeSchemaEditor` mounted with different props.
 */
export function AdminSportsPage() {
  const { sportId } = useParams();
  const navigate = useNavigate();

  const { data: sports, isLoading, isError } = useAdminSportCatalog();

  const selectedSportId = sportId === undefined ? undefined : Number(sportId);
  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  // No inactive-sport special case here any more: A11 (shipped with this ticket) added the
  // admin-only schema read that resolves regardless of active state, so a deactivated sport's
  // schema loads and edits like any other. Before it, A9's member-facing GET 404'd for one while
  // its PUT accepted one, and this page had to skip the request and explain itself. A17's
  // session-schema admin read (ADMIN-5) has the same admin-twin shape.
  const schemaQuery = useSportAttributeSchema(selectedSportId);
  const sessionSchemaQuery = useSessionAttributeSchemaAdmin(selectedSportId);
  const updateSport = useUpdateSport(selectedSportId);
  const replaceSchema = useReplaceSportAttributeSchema(selectedSportId);
  const replaceSessionSchema = useReplaceSessionAttributeSchema(selectedSportId);

  const selectSport = (id: number) => {
    updateSport.reset();
    replaceSchema.reset();
    replaceSessionSchema.reset();
    navigate(`/admin/sports/${id}`);
  };

  // ADMIN-4: the sections are independently dirty and each owns its own draft, so
  // this page is the lowest point that knows about all of them. Tracked as separate
  // flags rather than one so one section clearing itself can't mask another still being dirty.
  const { setHasUnsavedChanges } = useAdminOutletContext();
  const [areFieldsDirty, setAreFieldsDirty] = useState(false);
  const [isSchemaDirty, setIsSchemaDirty] = useState(false);
  const [isSessionSchemaDirty, setIsSessionSchemaDirty] = useState(false);

  // Stable identities — these are effect dependencies inside the children.
  const reportFieldsDirty = useCallback((dirty: boolean) => setAreFieldsDirty(dirty), []);
  const reportSchemaDirty = useCallback((dirty: boolean) => setIsSchemaDirty(dirty), []);
  const reportSessionSchemaDirty = useCallback(
    (dirty: boolean) => setIsSessionSchemaDirty(dirty),
    [],
  );

  useEffect(() => {
    setHasUnsavedChanges(areFieldsDirty || isSchemaDirty || isSessionSchemaDirty);
    // Leaving this section clears the flag: AdminLayout outlives this page, so a
    // lingering `true` would keep warning on logout from a section with no forms.
    return () => setHasUnsavedChanges(false);
  }, [areFieldsDirty, isSchemaDirty, isSessionSchemaDirty, setHasUnsavedChanges]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-text-primary">Sports</h2>
      <p className="mt-1 text-2sm text-text-muted">
        Update an existing sport&rsquo;s fields and its per-sport attribute schemas. Creating
        and deleting sports is not available here.
      </p>

      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:flex-1">
          {isLoading ? <p className="text-2sm text-text-muted">Loading sports…</p> : null}
          {isError ? (
            <p role="alert" className="text-2sm text-text-danger">
              Could not load the sport catalogue.
            </p>
          ) : null}
          {!isLoading && !isError ? (
            <SportCatalogTable
              sports={sports}
              selectedSportId={selectedSportId}
              onSelect={selectSport}
            />
          ) : null}
        </div>

        <div className="w-full lg:w-96 lg:shrink-0">
          {selectedSport ? (
            <div className="rounded-xl border-hairline border-border bg-surface-2 p-4">
              <h3 className="sr-only">Detail for {selectedSport.name}</h3>

              <CollapsibleSection title="Sport fields">
                <SportFieldsForm
                  // Remount on sport change so the draft re-seeds even if the previous sport
                  // shared field values with this one.
                  key={selectedSport.id}
                  sport={selectedSport}
                  onSave={updateSport.updateSport}
                  isSaving={updateSport.isPending}
                  errorMessage={updateSport.errorMessage}
                  isSaved={updateSport.isSuccess}
                  onDirtyChange={reportFieldsDirty}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Profile attributes">
                <AttributeSchemaEditor
                  key={`schema-${selectedSport.id}`}
                  schema={schemaQuery.data}
                  onSave={replaceSchema.replaceSchema}
                  isLoading={schemaQuery.isLoading}
                  isSaving={replaceSchema.isPending}
                  errorMessage={
                    schemaQuery.isError
                      ? 'Could not load this sport’s attribute schema.'
                      : replaceSchema.errorMessage
                  }
                  isSaved={replaceSchema.isSuccess}
                  onDirtyChange={reportSchemaDirty}
                  viewerTitle="Profile attributes"
                />
              </CollapsibleSection>

              <CollapsibleSection title="Session attributes">
                <AttributeSchemaEditor
                  key={`session-schema-${selectedSport.id}`}
                  schema={sessionSchemaQuery.data}
                  onSave={replaceSessionSchema.replaceSchema}
                  isLoading={sessionSchemaQuery.isLoading}
                  isSaving={replaceSessionSchema.isPending}
                  errorMessage={
                    sessionSchemaQuery.isError
                      ? 'Could not load this sport’s session attribute schema.'
                      : replaceSessionSchema.errorMessage
                  }
                  isSaved={replaceSessionSchema.isSuccess}
                  onDirtyChange={reportSessionSchemaDirty}
                  fieldId="session-attribute-schema"
                  fieldLabel="Session schema document (JSON)"
                  saveLabel="Save session attributes"
                  viewerTitle="Session attributes"
                />
              </CollapsibleSection>
            </div>
          ) : (
            <p className="text-2sm text-text-muted">
              Select a sport to edit its fields and attribute schemas.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
