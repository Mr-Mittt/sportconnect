import { getApiError } from '@/shared/lib/apiError';

const FALLBACK = 'Something went wrong. Please try again.';

function text(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** `SESSION_IMPORT_INVALID` says why in `errorParams.reason`; one sentence per reason. */
function invalidMessage(params: Record<string, unknown> | undefined): string {
  const title = text(params, 'title');
  const game = text(params, 'game');
  const max = text(params, 'max');
  switch (text(params, 'reason')) {
    case 'REQUEST_INCOMPLETE':
      return 'Group id and location id are both needed.';
    case 'SESSION_COUNT':
      return `A call takes between 1 and ${max || '100'} sessions.`;
    case 'LOCATION_TIMEZONE':
      return "That location has no timezone, so the times can't be read.";
    case 'SESSION_INCOMPLETE':
      return title ? `"${title}" is missing its date or times.` : 'A session in the file has no title, date or times.';
    case 'END_NOT_AFTER_START':
      return `"${title}" ends before it starts.`;
    case 'GAME_COUNT':
      return `"${title}" has no games, or more than the sport allows (${max || 'its limit'}).`;
    case 'SIDE_SIZE':
      return `Game ${game} of "${title}" has a side with no players or too many (at most ${max || 'the sport allows'}).`;
    case 'NAME_BLANK':
      return `Game ${game} of "${title}" has an empty name.`;
    case 'DUPLICATE_PLAYER':
      return `Game ${game} of "${title}" has the same member twice.`;
    default:
      return 'The import request is not valid.';
  }
}

/**
 * The text to show for a failed preview or import. Fixed English, one message per SESSION-70 error code (admin screens are
 * English-only, CLIENT-I18N-6), never the server's own text. Anything unrecognised is a generic line.
 */
export function describeImportError(error: unknown): string {
  const e = getApiError(error);
  switch (e.code) {
    case 'SESSION_IMPORT_INVALID':
      return invalidMessage(e.params);
    case 'SESSION_IMPORT_UNRESOLVED_NAMES': {
      const names = e.params?.names;
      return Array.isArray(names) && names.length > 0
        ? `These names still need a member: ${names.join(', ')}.`
        : 'Some names still need a member.';
    }
    case 'SESSION_IMPORT_HOST_NOT_MEMBER':
      return "The group's owner is not an active member, so they can't host the sessions.";
    case 'SESSION_IMPORT_ALIAS_NOT_MEMBER':
      return `The member chosen for "${text(e.params, 'name')}" is not an active member of the group.`;
    case 'SESSION_IMPORT_NOT_FINISHED':
      return `"${text(e.params, 'title')}" has not ended yet. Only finished sessions can be imported.`;
    case 'GROUP_NOT_FOUND':
      return 'No active group has that id.';
    case 'SESSION_LOCATION_SPORT_MISMATCH':
      return "That location is for a different sport than the group's.";
    case 'SESSION_SPORT_REQUIRED':
      return "That group has no sport, so sessions can't be imported into it.";
    default:
      break;
  }
  if (e.category === 'FORBIDDEN') return 'Only an admin can import sessions.';
  if (e.category === 'NETWORK') return "Couldn't reach the server. Check the connection and try again.";
  return FALLBACK;
}
