// Every real backend endpoint wraps its response in this envelope
// (`modules/common/.../ApiResponse.java`) — shared across features, not
// redefined per feature (auth, feed, groups all use the same shape).
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string; // ISO timestamp
  /**
   * C12: machine-readable error code (`<DOMAIN>_<REASON>`, registered in
   * `documentation/md/ERROR_CODES.md`). Present only on some error responses; omitted otherwise.
   */
  errorCode?: string;
  /** C12: values interpolated into `message`, or `{ fields: { <field>: <message> } }` for a validation failure. */
  errorParams?: Record<string, unknown>;
}
