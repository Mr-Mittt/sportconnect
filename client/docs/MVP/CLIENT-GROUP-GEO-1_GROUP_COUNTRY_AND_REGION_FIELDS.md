# CLIENT-GROUP-GEO-1 · Country and region on the group create and edit forms

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** B25 (server: a group has a required country and region)
**Filed:** 2026-11-27, the client half of B25, filed at the pickup of SESSION-55 (group seasons need the group's local date and country rules).

The group create form pre-fills country and region from the signed-in owner's profile and the owner can change them (a region list that follows the chosen country, from the reference endpoints the register page already uses); the group edit form shows and changes them; the group page shows them. A region of another country is refused by the server (its error code gets en and vi copy here). en and vi for every string.

**Out of scope:** the timezone (derived by the server), season screens (CLIENT-SESSION-43).

## Delta 2026-11-27 (from B25, built): the contract this ticket builds against
- `CreateGroupRequest` and `UpdateGroupRequest` take optional `countryId` and `regionId`: **send both or neither**. Neither on create makes the server use the owner's profile (`400 GROUP_GEO_REQUIRED` when the owner has none); this ticket's create form sends them explicitly. `GroupResponse` gains `countryId`, `regionId` and `timezone` (the region's, else the country's; absent when the reference data has none). `CountryResponse` and `RegionResponse` gain `timezone`.
- New codes to give en and vi copy in `errors:codes` (I18N-5): `GROUP_GEO_REQUIRED` ("complete your profile's country and region, or choose them here"), `GROUP_GEO_INCOMPLETE` (one of the two missing). A wrong pair is the existing `COUNTRY_UNKNOWN` / `REGION_UNKNOWN`. Update the I18N-4 census row of the group create and edit forms.
- The owner or an admin changes them with `PUT /api/groups/{id}`; a plain member gets `403 GROUP_ADMIN_REQUIRED` (existing).
