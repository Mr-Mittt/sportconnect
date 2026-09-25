#!/usr/bin/env node
// Regenerates the bundled boundary data used by GeoBoundaryResolver (REF-2):
//
//   src/main/resources/geo/countries.tsv    iso2 <TAB> WKT        Natural Earth admin-0, 1:50m, all countries
//   src/main/resources/geo/regions-VN.tsv   iso_3166_2 <TAB> WKT  Natural Earth admin-1, 1:10m, Vietnam only
//   src/main/resources/geo/tz-country.tsv   IANA zone id <TAB> iso2  single-country zones + backward aliases
//
// Usage (from modules/reference/reference-impl/geo-data):
//
//   node build-geo-data.mjs [workDir]
//
// Needs Node 18+ and network access (downloads the sources into workDir, default ./.work, which is git-ignored,
// and fetches mapshaper through npx). Nothing downloaded is committed — only the three generated files.
//
// Sources and licences (also recorded in reference-impl/CLAUDE.md):
//   - Natural Earth vector data, https://www.naturalearthdata.com — public domain.
//   - IANA time zone database (zone1970.tab, backward), https://www.iana.org/time-zones — public domain.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workDir = resolve(process.argv[2] ?? join(here, '.work'));
const outDir = resolve(here, '..', 'src', 'main', 'resources', 'geo');

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const TZ = 'https://raw.githubusercontent.com/eggert/tz/main';

// Simplification strength (share of vertices kept) and coordinate precision (0.001 deg ~ 110 m).
// Countries are 1:50m already, so a moderate cut; Vietnam's provinces come from 1:10m, so a harder one.
const COUNTRY_KEEP = '50%';
const REGION_KEEP = '40%';
const PRECISION = '0.001';

mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

async function download(url, name) {
    const target = join(workDir, name);
    if (!existsSync(target)) {
        console.log(`download ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    }
    return target;
}

function mapshaper(input, output, commands) {
    execSync(`npx --yes mapshaper "${input}" ${commands} -o "${output}" format=geojson precision=${PRECISION} force`,
        { stdio: 'inherit' });
}

const ring = (r) => '(' + r.map(([x, y]) => `${x} ${y}`).join(',') + ')';
const polygon = (p) => '(' + p.map(ring).join(',') + ')';

function toWkt(geometry) {
    if (geometry.type === 'Polygon') return 'POLYGON' + polygon(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') return 'MULTIPOLYGON(' + geometry.coordinates.map(polygon).join(',') + ')';
    return null;
}

function writeTsv(name, rows) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    writeFileSync(join(outDir, name), rows.map((r) => r.join('\t')).join('\n') + '\n');
    console.log(`${name}: ${rows.length} rows`);
}

// ---- countries (admin-0) -------------------------------------------------------------------------------------
{
    const src = await download(`${NE}/ne_50m_admin_0_countries.geojson`, 'ne_50m_admin_0_countries.geojson');
    const out = join(workDir, 'countries.simplified.geojson');
    // ISO_A2_EH is populated for France and Norway, where ISO_A2 is -99 in Natural Earth.
    mapshaper(src, out, `-filter-fields ISO_A2_EH -simplify ${COUNTRY_KEEP} keep-shapes`);
    const rows = [];
    for (const f of JSON.parse(readFileSync(out, 'utf8')).features) {
        const iso2 = f.properties.ISO_A2_EH;
        const wkt = f.geometry && toWkt(f.geometry);
        if (/^[A-Z]{2}$/.test(iso2) && wkt) rows.push([iso2, wkt]);
    }
    writeTsv('countries.tsv', rows);
}

// ---- Vietnam regions (admin-1) -------------------------------------------------------------------------------
{
    const src = await download(`${NE}/ne_10m_admin_1_states_provinces.geojson`, 'ne_10m_admin_1_states_provinces.geojson');
    const out = join(workDir, 'regions-VN.simplified.geojson');
    mapshaper(src, out, `-filter "iso_a2 === 'VN'" -filter-fields iso_3166_2 -simplify ${REGION_KEEP} keep-shapes`);
    const rows = [];
    for (const f of JSON.parse(readFileSync(out, 'utf8')).features) {
        const code = f.properties.iso_3166_2;
        const wkt = f.geometry && toWkt(f.geometry);
        if (/^VN-[A-Z0-9]{2}$/.test(code) && wkt) rows.push([code, wkt]);
    }
    writeTsv('regions-VN.tsv', rows);
}

// ---- timezone -> country -------------------------------------------------------------------------------------
// zone1970.tab lists every country sharing a zone. Only single-country zones are kept: a multi-country zone (e.g.
// Asia/Bangkok = TH,CX,KH,LA,VN) must not be used to guess a country. `backward` links (Asia/Saigon ->
// Asia/Ho_Chi_Minh) are added as aliases when their target is kept, because browsers report those names.
{
    const zone1970 = readFileSync(await download(`${TZ}/zone1970.tab`, 'zone1970.tab'), 'utf8');
    const backward = readFileSync(await download(`${TZ}/backward`, 'backward'), 'utf8');
    const zones = new Map();
    for (const line of zone1970.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const [countries, , zone] = line.split('\t');
        const list = countries.split(',');
        if (list.length === 1) zones.set(zone, list[0]);
    }
    const aliases = new Map();
    for (const line of backward.split('\n')) {
        const m = /^Link\s+(\S+)\s+(\S+)/.exec(line);
        if (m && zones.has(m[1]) && !zones.has(m[2])) aliases.set(m[2], zones.get(m[1]));
    }
    writeTsv('tz-country.tsv', [...zones, ...aliases]);
}
