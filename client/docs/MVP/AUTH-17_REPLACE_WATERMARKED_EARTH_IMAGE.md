# AUTH-17 · Replace the watermarked `earth.png` in the auth illustration

**Status:** `TODO` · **Type:** Asset / licence follow-up · **Depends on:** the owner supplying a clean image · **Gates:** nothing

**Filed:** 2026-10-15, found in the AUTH-15 pickup (and noted by auth A24).

## What

`client/public/earth.png` (also copied into `client/design-reference/`) is the globe in the community illustration on every Keycloak-hosted page and on the callback page. The file visibly carries a tiled **"Vecteezy"** stock-site watermark across the globe (checked 2026-10-15). The owner said the image was generated with Claude design, so either the file is a stock preview that was used as a reference by mistake, or the watermark came along with the generation. Replace it with a clean original (same square crop, transparent background) or generate a clean one.

## Acceptance

- `client/public/earth.png` and `client/design-reference/earth.png` are the clean image; no watermark at 1280 px.
- The Keycloak theme picks it up with no code change (it imports `client/public/earth.png`); rebuild the theme Storybook and run the `update-baselines` dispatch, because the 57 `auth-theme-*` baselines and the callback-page screenshots contain the globe.

## Out of scope

Changing the illustration itself (`CommunityIllustration`).
