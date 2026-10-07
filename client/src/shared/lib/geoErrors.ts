/**
 * CLIENT-ERR-8: the reference codes the geo pickers (country / region) answer for themselves. The
 * server rejects a stale or deactivated country or region (`COUNTRY_UNKNOWN`, `REGION_UNKNOWN`,
 * `REGION_COUNTRY_REQUIRED` on register and profile update, `COUNTRY_NOT_FOUND` on the regions
 * list). They show in the pickers' own hint line, never in the form's error banner.
 */
const GEO_SERVER_CODES: ReadonlySet<string> = new Set([
  'COUNTRY_UNKNOWN',
  'REGION_UNKNOWN',
  'REGION_COUNTRY_REQUIRED',
  'COUNTRY_NOT_FOUND',
]);

/** True when `code` is one of the reference codes the geo pickers handle. */
export function isGeoServerCode(code: string | null | undefined): code is string {
  return code !== null && code !== undefined && GEO_SERVER_CODES.has(code);
}
