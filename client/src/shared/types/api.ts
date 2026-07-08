// Every real backend endpoint wraps its response in this envelope
// (`modules/common/.../ApiResponse.java`) — shared across features, not
// redefined per feature (auth, feed, groups all use the same shape).
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string; // ISO timestamp
}
