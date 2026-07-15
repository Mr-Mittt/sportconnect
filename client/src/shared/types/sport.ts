export type SportKey = 'football' | 'basketball' | 'tennis'; // extend as sports are added

export interface SportProfile {
  key: SportKey;
  label: string;
  icon: string; // icon name, e.g. 'ball-football'
  colorRamp: string; // design-token ramp name, e.g. 'teal'
}

/** 1:1 with `UserSportProfileResponse` (`modules/sport/sport-api`) — the raw
 * shape `GET /api/sports/profiles/user/{userId}` returns, before SPORT-1's
 * mapping layer resolves it to a `SportProfile`. */
export interface UserSportProfileResponse {
  id: number;
  userId: string;
  sportId: number;
  sportName: string;
  skillLevel: string | null;
  yearsOfExperience: number | null;
  preferredPosition: string | null;
  bio: string | null;
  attributes: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
