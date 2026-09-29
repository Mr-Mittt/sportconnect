import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { useOverridableText } from './useOverridableText';

describe('useOverridableText', () => {
  it('renders the given default namespace when no override prefix is given', () => {
    const { result } = renderHook(() => useOverridableText('sharedDialogs'));
    expect(result.current('joinFeedback.gotIt')).toBe('Got it');
  });

  it('falls back to the default namespace when the override prefix has no matching key', () => {
    const { result } = renderHook(() => useOverridableText('sharedDialogs', 'nonexistentFeature:save'));
    expect(result.current('joinFeedback.gotIt')).toBe('Got it');
  });

  it('prefers the override key when the caller-supplied namespace defines it', () => {
    // A throwaway namespace, added only for this test, so it needs no cleanup afterward.
    i18n.addResourceBundle('en', 'testFeature', { save: { joinFeedback: { gotIt: 'Got it (override)' } } });

    const { result } = renderHook(() => useOverridableText('sharedDialogs', 'testFeature:save'));
    expect(result.current('joinFeedback.gotIt')).toBe('Got it (override)');
  });

  it('resolves against a different default namespace entirely', () => {
    i18n.addResourceBundle('en', 'testNs', { hello: 'Hi there' });

    const { result } = renderHook(() => useOverridableText('testNs'));
    expect(result.current('hello')).toBe('Hi there');
  });
});
