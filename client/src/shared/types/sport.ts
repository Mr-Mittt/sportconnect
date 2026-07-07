export type SportKey = 'football' | 'basketball' | 'tennis'; // extend as sports are added

export interface SportProfile {
  key: SportKey;
  label: string;
  icon: string; // icon name, e.g. 'ball-football'
  colorRamp: string; // design-token ramp name, e.g. 'teal'
}
