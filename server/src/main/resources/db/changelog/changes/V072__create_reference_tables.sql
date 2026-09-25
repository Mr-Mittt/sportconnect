-- REF-1: the `reference` domain's three tables -- languages, countries, regions (the "zone" of the
-- Language / Country / Zone feature is a region/state/province, NOT a timezone).
-- Design: documentation/md/REFERENCE_DATA_DESIGN.md
--
-- Domain-scoped: no other domain has a database foreign key into these tables (cross-domain
-- references are ids only). The one FK, regions.country_id, is intra-domain.
-- Rows are seeded by V073; they are deactivated (is_active = false), never deleted, because other
-- domains store these ids (users.country_id / region_id in U16, locations in LOC-5).

CREATE TABLE languages (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(35)  NOT NULL UNIQUE,  -- BCP 47 language tag, e.g. 'en', 'vi'
    name        VARCHAR(100) NOT NULL,         -- English name
    native_name VARCHAR(100) NOT NULL,         -- the language's own name
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE countries (
    id        BIGSERIAL PRIMARY KEY,
    iso2      VARCHAR(2)   NOT NULL UNIQUE,    -- ISO 3166-1 alpha-2
    iso3      VARCHAR(3)   NOT NULL UNIQUE,    -- ISO 3166-1 alpha-3
    name      VARCHAR(100) NOT NULL,           -- English name; localized display is client-side (Intl.DisplayNames)
    is_active BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE regions (
    id          BIGSERIAL PRIMARY KEY,
    country_id  BIGINT       NOT NULL REFERENCES countries (id),
    iso_code    VARCHAR(10)  NOT NULL UNIQUE,  -- ISO 3166-2, e.g. 'VN-SG'
    name        VARCHAR(100) NOT NULL,         -- English / romanized name
    native_name VARCHAR(100) NOT NULL,         -- name in the country's own language
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_regions_country_id ON regions (country_id);
