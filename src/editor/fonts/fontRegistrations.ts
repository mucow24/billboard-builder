/**
 * Tells the rest of the editor when a font has been registered with the browser.
 *
 * Whatever is drawn or measured through a canvas font declaration uses what the
 * browser has for the family at that moment: a fallback font, if the family's
 * own file has not been registered yet. The browser sends no event when a face
 * that is already loaded joins `document.fonts`, which is how this app adds all
 * of its fonts, so the font loader announces each one here. Anything that
 * depends on a family's faces (canvas text, cached measurements) can then
 * follow that family alone.
 *
 * Pure: no DOM, so it is testable on its own.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const registrationsByFamily = new Map<string, number>();

/** The browser matches family names without regard to case. */
function familyKey(family: string): string {
  return family.trim().toLowerCase();
}

/**
 * How many faces have been registered for `family` since the page loaded. The
 * number changes exactly when what the browser can draw that family with may
 * have changed, and never because of another family.
 */
export function getFontRegistrationCount(family: string): number {
  return registrationsByFamily.get(familyKey(family)) ?? 0;
}

/** Calls `listener` after every registration, of any family. Returns the unsubscribe function. */
export function subscribeToFontRegistrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For the font loader: call once a face of `family` has joined `document.fonts`. */
export function announceFontRegistration(family: string): void {
  const key = familyKey(family);
  registrationsByFamily.set(key, (registrationsByFamily.get(key) ?? 0) + 1);
  for (const listener of [...listeners]) {
    listener();
  }
}
