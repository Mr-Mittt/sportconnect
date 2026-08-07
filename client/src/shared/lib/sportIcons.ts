import {
  IconBallBasketball,
  IconBallFootball,
  IconBallTennis,
  IconQuestionMark,
  IconTournament,
  type Icon,
} from '@tabler/icons-react';

const iconsByName: Record<string, Icon> = {
  'ball-football': IconBallFootball,
  'ball-basketball': IconBallBasketball,
  'ball-tennis': IconBallTennis,
  // SPORT-3: Tabler has no dedicated badminton/pickleball icon — 'ball-tennis'
  // (Badminton) and 'tournament' (Pickleball) are the closest racquet/court
  // stand-ins available, picked for visual distinctness from each other.
  tournament: IconTournament,
};

/**
 * Resolves a SportProfile.icon name (bare Tabler name, e.g. 'ball-football')
 * to its icon component. Unknown names fall back to a question mark rather
 * than crashing — new sports can arrive from the backend before the client
 * maps them.
 */
export function getSportIcon(name: string): Icon {
  return iconsByName[name] ?? IconQuestionMark;
}
