import {
  IconBallBasketball,
  IconBallFootball,
  IconBallTennis,
  IconQuestionMark,
  type Icon,
} from '@tabler/icons-react';

const iconsByName: Record<string, Icon> = {
  'ball-football': IconBallFootball,
  'ball-basketball': IconBallBasketball,
  'ball-tennis': IconBallTennis,
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
