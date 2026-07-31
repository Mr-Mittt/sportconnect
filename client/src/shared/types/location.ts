// Moved out of features/location/types.ts (CLIENT-SESSION-1) once shared/types/session.ts
// needed it too (Session.location) — same "shared code never imports from features" precedent
// HF-2 established for SportKey/SportProfile; re-exported from features/location/types.ts so
// that feature's own imports don't change.

export interface Location {
  id: number;
  sportId: number;
  sportName: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceMapsUrl: string | null;
  claimedByVendorId: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
