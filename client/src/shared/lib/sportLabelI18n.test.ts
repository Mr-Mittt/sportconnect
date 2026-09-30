import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { useSportCatalogStore } from './sportCatalogStore';
import { getSportLabel, getSportProfileConfig } from './sportProfileConfig';
import { getSportLabelForId, sportProfileForId } from './sportProfileFromId';

/** CLIENT-I18N-11: sport names resolve through `common:sport.*` and follow a language switch. */
describe('sport labels', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
    useSportCatalogStore.setState({ byKey: new Map(), byId: new Map() });
  });

  it('keeps English names byte-identical', () => {
    expect(getSportLabel('badminton')).toBe('Badminton');
    expect(getSportProfileConfig('pickleball')).toEqual({ label: 'Pickleball', colorRamp: 'coral' });
  });

  it('translates known sports and keeps colorRamp', async () => {
    await i18n.changeLanguage('vi');
    expect(getSportLabel('badminton')).toBe('Cầu lông');
    expect(getSportLabel('pickleball')).toBe('Pickleball');
    expect(getSportProfileConfig('badminton')).toEqual({ label: 'Cầu lông', colorRamp: 'teal' });
  });

  it('falls back to the backend name, then the title-cased key, for an unknown sport', async () => {
    await i18n.changeLanguage('vi');
    expect(getSportLabel('squash', 'Squash (server)')).toBe('Squash (server)');
    expect(getSportLabel('squash')).toBe('Squash');
    expect(getSportProfileConfig('squash')).toEqual({ label: 'Squash', colorRamp: 'gray' });
  });

  it('resolves a backend sportId/sportName pair through the catalog', async () => {
    const entry = { id: 7, key: 'badminton', name: 'Badminton', iconUrl: null };
    useSportCatalogStore.setState({
      byKey: new Map([['badminton', entry]]),
      byId: new Map([[7, entry]]),
    });
    await i18n.changeLanguage('vi');
    expect(getSportLabelForId(7, 'Badminton')).toBe('Cầu lông');
    expect(sportProfileForId(7)?.label).toBe('Cầu lông');
    expect(getSportLabelForId(99, 'Server Name')).toBe('Server Name'); // not in catalog → fallback
    expect(getSportLabelForId(null, 'Server Name')).toBe('Server Name');
  });
});
