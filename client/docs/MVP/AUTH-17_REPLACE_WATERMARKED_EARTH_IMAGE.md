# AUTH-17 · Replace the watermarked `earth.png` in the auth illustration

**Status:** `DONE` (2026-10-21) · **Type:** Asset / licence follow-up · **Depends on:** the owner supplying a clean image (done: generated with Claude Design, source below) · **Gates:** nothing

**Filed:** 2026-10-15, found in the AUTH-15 pickup (and noted by auth A24).

## What

`client/public/earth.png` (also copied into `client/design-reference/`) is the globe in the community illustration on every Keycloak-hosted page and on the callback page. The file visibly carries a tiled **"Vecteezy"** stock-site watermark across the globe (checked 2026-10-15). The owner said the image was generated with Claude design, so either the file is a stock preview that was used as a reference by mistake, or the watermark came along with the generation. Replace it with a clean original (same square crop, transparent background) or generate a clean one.

## Acceptance

- `client/public/earth.png` and `client/design-reference/earth.png` are the clean image; no watermark at 1280 px.
- The Keycloak theme picks it up with no code change (it imports `client/public/earth.png`); rebuild the theme Storybook to check it. ~~Run the `update-baselines` dispatch here~~ (changed 2026-10-21): AUTH-19 owns the one dispatch for the whole topic, which also covers these baselines (60 `auth-theme-*` files by now, not 57; the callback page has no screenshot).

## Scope change 2026-10-21 (owner, at pickup): two small layout changes ride with the new globe

The owner generated a replacement globe with Claude Design (route chosen at pickup: no stock image, no watermark removal; the data source it used is to be recorded here once the designer states it) and asked for two changes to the illustration while it is open:

- **People circles smaller than group circles.** Today all nine floating circles are 40 px (person icon 20, group icon 22). The person circles get a smaller size than the group ones (proposed 32 px with an 18 px icon, and 44 px with a 24 px icon); each circle keeps its **centre** where it is, so the connector lines still end at the centres. The animation (a 6 px float over 4.5 s) is unchanged.
- **Centre the globe.** The globe circle is centred at (174, 166) in the 360 × 340 box, while the hub, the avatar ring and the connector lines are centred on (180, 180): the globe sits 6 px left and 14 px up of everything it is meant to be the middle of (and the old PNG's own sphere was off-centre inside its file). The circle moves to `left: 28; top: 28` (centre 180, 180). The frozen `design-reference-login.html` gets the same numbers so the reference and the app stay equal.

Image note found while checking: the new file was first saved to `client/design-reference/earth.png` only (2048 x 2048, RGBA, globe filling the square, a light-blue sea instead of a transparent one, 625 KB); `client/public/earth.png`, the one the app and the theme use, still held the watermarked file. To be settled with the owner: copy it to `public/`, downscale it (the slot shows it at 304 px), and whether the light-blue sea replaces the white sphere shading the container draws (an opaque image hides that shading).

## Out of scope

Changing the illustration beyond the two items above (`CommunityIllustration`): the number, positions and colours of the people, groups and sport icons, the connector lines and the hub stay as they are.

## Design (approved 2026-10-21)

The image is replaced by an original globe, and two layout changes ride with it (see the scope change above). The sea is made transparent (owner's choice A) because the design file calls the globe a "shaded 3D globe backdrop (drop a real earth/continents image onto it)": the sphere shading belongs to the container, the PNG only has to be the continents.

- **Image:** the designer's 2048 x 2048 file (light-blue sea) is downscaled to 640 x 640 (twice the 304 px slot) and the sea is turned into alpha by un-blending (pixel = t * land + (1 - t) * sea, so alpha = t and the colour is the flat land colour `#2c2c2a`), which keeps clean anti-aliased coastlines. A throwaway script outside the repo did it (Playwright Chromium canvas, nothing added to `package.json`). `client/public/earth.png` and `client/design-reference/earth.png` are byte-identical.
- **`CommunityIllustration`:** circles are placed by their centre (`cx`, `cy`); person 32 px with an 18 px icon, group 44 px with a 24 px icon (were 40 px, icons 20 and 22); the globe circle moves from `left: 22; top: 14` to `left: 28; top: 28`, so its centre is (180, 180), the point the hub, the connector lines and the ring of people are drawn around (it was at (174, 166)). `data-illustration` / `data-kind` attributes mark the globe, the hub and each circle for the tests. The float animation, the sport icons, the lines and the hub are unchanged.
- **Design references:** `design-reference-login.html` and `design-reference/CommunityGlobe.dc.html` carry the same numbers.

## Source of the image (recorded for the licence question)

Generated with Claude Design from the prompt of 2026-10-21, no stock or third-party image involved. The designer's own statement: it drew the globe from **Natural Earth 1:50m Land polygons** (`ne_50m_land`, public domain, `geojson/ne_50m_land.geojson` from the `nvkelso/natural-earth-vector` repository on GitHub, the same layer as the "Land" download on naturalearthdata.com), with its own Python code (shapely): orthographic view centred on 25°W 18°N, cut to the visible half, lightly simplified coastlines, very small islands dropped, written as an SVG and rendered to PNG. Terms: https://www.naturalearthdata.com/about/terms-of-use/ (no permission needed, attribution optional). **Gap:** the repository commit that was downloaded was not recorded; the designer offered to pin a release (for example v5.1.2), rebuild and give a checksum if an exact record is ever needed. The previous file (a Vecteezy preview with a baked-in checkerboard) is gone from the working tree; it stays in git history.

## Built

- `client/public/earth.png` and `client/design-reference/earth.png`: 640 x 640 RGBA, about 100 KB (the old file was 757 x 702, 166 KB).
- `CommunityIllustration.tsx`, `design-reference-login.html`, `CommunityGlobe.dc.html` as in Design.
- **Tests:** `CommunityIllustration.test.tsx` +5 (six people and three groups; every person circle smaller than every group circle, exact sizes and icon sizes; every circle round and keeping its old centre; globe centre equals hub centre (180, 180); globe inside the 360 x 340 drawing) and a new `earthAsset.test.ts` (PNG, 640 x 640, colour type 6, under 150 KB, no "vecteezy" in the bytes, identical to the design-reference copy).
- **Docs:** this file, the backlog row, `PROGRESS.md`, AUTH-19's note.

## Verification

- Image checks in the processing script: the corner and the middle of the Atlantic have alpha 0, Africa and South America are opaque `#2c2c2a`. Rendered at 304 px on the page's own sphere gradient (and larger) the sphere shading shows through; and in the built theme Storybook the login page at 1280 px shows the globe centred under the hub, groups visibly larger than people, with the panel hidden at 375 px as before. Looked at as screenshots, not compared to a baseline.
- tsc: only the 3 `e2e/keycloak` and `e2e/theme` type errors in files this ticket did not touch; eslint clean for `src/features/auth`.
- Vitest, scoped: `CommunityIllustration` 8 and `earthAsset` 3 pass.
- **Mutation check:** 9 breakages (person as big as a group, group smaller than a person, person icon not smaller, a circle placed by `left`/`top` again so its centre drifts, in both axes, the globe back at the old left or top, a group turned into a person, and the old watermarked 757 px file put back in `public/`): all 9 turned a test red, sources restored.
- Theme Storybook rebuilt (`pnpm build-theme-storybook`) with the new file: success. Theme gate (`--project=theme`): 103 passed, 1 failed: `register: every field and the submit button are reachable by Tab` expects a `#username` field, which the register page has hidden since A27 (see `Register.tsx`); not caused by this ticket (it touches no register code), not compared on a stashed tree. Not filed yet, see the report.
- **E2E:** `e2e` project, full: 189 passed, 1 failed: `msw-setup: MSW rejects /api/auth/refresh without a valid refresh cookie` ("Failed to fetch" under load), which passes 4 of 4 when the spec is run alone: a parallel-load flake, not a regression. No e2e spec references the illustration.
- **Visual-regression expectation:** all 60 `auth-theme-*` baselines contain the globe and the new layout, but none exists in the repo yet, so nothing committed changes; their one creation is AUTH-19's dispatch. No other baseline is affected (no other spec renders `CommunityIllustration`). Not run on this Windows host. **Executed by AUTH-19 (2026-10-22):** the dispatch created 81 `auth-theme-*` files (not 60; see AUTH-19), all with the new globe; nothing else changed for this ticket.
- **Not seen:** the app's own `/auth/callback` page rendered next to the theme (same component, same file); a real Keycloak-hosted page (the theme Storybook was used instead); Safari and Firefox rendering of the alpha edge.

## Observation, not fixed (owner to decide)

With the globe centred on the Atlantic (25°W 18°N), the coral bike icon and the purple barbell fall on the dark landmasses (South America and Africa), where their dark-red and dark-purple strokes and the connector lines are hard to see. The old globe had the same dark continents in the same area, so this is not new, but centring moved the icons a little. A different rotation of the globe (for example more ocean under the two icons) would fix it without touching the code; it needs a new PNG.

## Done when

`earth.png` is an original, transparent, watermark-free globe with a recorded source; people circles are smaller than group circles; the globe is centred on the hub; the checks above are stated honestly.
