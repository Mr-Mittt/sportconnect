// Typed 1:1 against the real backend DTOs (modules/location/location-api/.../dto/) —
// LocationResponse, CreateLocationRequest, ResolveMapsUrlRequest, ResolvedMapsUrlResponse.
// Id types mirror the backend's generation strategy: Location.id is a JPA Long/Postgres
// BIGSERIAL, so `number` is correct here (same reasoning as feed/types.ts).

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

export interface CreateLocationPayload {
  sportId: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  sourceMapsUrl?: string;
}

// Nothing is persisted by this call — latitude/longitude are null when coordinates
// couldn't be detected (e.g. an unresolvable short link); the caller falls back to
// manual entry rather than treating a null result as an error.
export interface ResolvedMapsUrl {
  latitude: number | null;
  longitude: number | null;
  suggestedName: string | null;
}
