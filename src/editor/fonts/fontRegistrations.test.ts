import { describe, expect, it, vi } from 'vitest';

import {
  announceFontRegistration,
  getFontRegistrationCount,
  subscribeToFontRegistrations,
} from './fontRegistrations';

describe('font registrations', () => {
  it('counts registrations per family', () => {
    expect(getFontRegistrationCount('Counted Sans')).toBe(0);

    announceFontRegistration('Counted Sans');
    announceFontRegistration('Counted Sans');

    expect(getFontRegistrationCount('Counted Sans')).toBe(2);
  });

  it('leaves the count of every other family alone', () => {
    const before = getFontRegistrationCount('Bystander Serif');

    announceFontRegistration('Arriving Serif');

    expect(getFontRegistrationCount('Bystander Serif')).toBe(before);
  });

  it('treats family names that differ only in case as one family, as the browser does', () => {
    announceFontRegistration('Mixed Case');

    expect(getFontRegistrationCount('MIXED CASE')).toBe(1);
    expect(getFontRegistrationCount('mixed case')).toBe(1);
  });

  it('notifies subscribers after the count has changed, until they unsubscribe', () => {
    const seen: number[] = [];
    const listener = vi.fn(() => seen.push(getFontRegistrationCount('Notified Mono')));
    const unsubscribe = subscribeToFontRegistrations(listener);

    announceFontRegistration('Notified Mono');
    expect(seen).toEqual([1]);

    unsubscribe();
    announceFontRegistration('Notified Mono');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
