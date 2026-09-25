-- REF-1 (scope change 2): a default language per country, as data. The client pre-fills the Language
-- dropdown from it when a country is known and Language is still empty (browser language list wins over
-- this default; see REFERENCE_DATA_DESIGN.md section 4).
--
-- A NEW changelog rather than an edit to V072/V073: those were already applied to local databases, and an
-- applied changeset must not be edited (Liquibase checksum). Nullable: a country need not have a default,
-- and one whose language is not in `languages` (only en/vi today) simply has none. The FK is intra-domain
-- (languages and countries are both owned by the reference domain), so it is allowed.
--
-- IF NOT EXISTS so ReferenceApiIntegrationTest can run this exact file against the H2 schema.sql mirror,
-- which already carries the column, and still exercise the UPDATE below for real. Standard SQL otherwise.

ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_language_code VARCHAR(35) REFERENCES languages (code);

UPDATE countries SET default_language_code = 'vi' WHERE iso2 = 'VN';
