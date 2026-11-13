import { describe, expect, it } from 'vitest';
import { formatScoreCell, formatTeamNames } from './resultDisplay';

describe('formatTeamNames', () => {
  it('keeps the first two players whole (the line cuts them only when there is no room) and no count for two or fewer', () => {
    expect(formatTeamNames(['Alice Nguyen'])).toEqual({ names: ['Alice Nguyen'], more: null, title: 'Alice Nguyen' });
    expect(formatTeamNames(['Alice Nguyen', 'Carolina Fernandez']).names).toEqual(['Alice Nguyen', 'Carolina Fernandez']);
    expect(formatTeamNames(['Alice Nguyen', 'Carolina Fernandez']).more).toBeNull();
  });

  it('gives the team size for ...(x) past two players, still listing only the first two', () => {
    expect(formatTeamNames(['Ann', 'Bob', 'Cy'])).toMatchObject({ names: ['Ann', 'Bob'], more: 3 });
    expect(formatTeamNames(['Ann', 'Bob', 'Cy', 'Di', 'Ed'])).toMatchObject({ names: ['Ann', 'Bob'], more: 5 });
  });

  it('keeps the full list, one name per line, for the hover', () => {
    expect(formatTeamNames(['Alice Nguyen', 'Bob Tran', 'Cy']).title).toBe('Alice Nguyen\nBob Tran\nCy');
  });

  it('is empty for no players', () => {
    expect(formatTeamNames([])).toEqual({ names: [], more: null, title: '' });
  });
});

describe('formatScoreCell', () => {
  it('shows the score, or - when it is missing', () => {
    expect(formatScoreCell([21], ['Point'])).toEqual({ text: '21', title: null });
    expect(formatScoreCell([null], ['Point'])).toEqual({ text: '-', title: null });
    expect(formatScoreCell([0], ['Point']).text).toBe('0');
  });

  it('with several slots shows the first slot then (...), and every slot as a bullet for the hover', () => {
    expect(formatScoreCell([2, 4], ['Goals', 'Penalties'])).toEqual({
      text: '2(...)',
      title: '• Goals: 2\n• Penalties: 4',
    });
    expect(formatScoreCell([null, null], ['Goals', 'Penalties'])).toEqual({
      text: '-(...)',
      title: '• Goals: -\n• Penalties: -',
    });
  });
});
