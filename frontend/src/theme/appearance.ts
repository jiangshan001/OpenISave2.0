/**
 * Appearance preference: a UI-only setting kept in localStorage, never in the
 * vault. `index.html` repeats the resolve-and-apply step inline so the very
 * first paint already has the right colours; keep the two in step.
 */

export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'openisave.appearance';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

const PREFERENCES: AppearancePreference[] = ['system', 'light', 'dark'];

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (PREFERENCES as string[]).includes(value);
}

export function readPreference(): AppearancePreference {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearancePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writePreference(preference: AppearancePreference): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode, locked-down profile); the
    // choice then simply lasts for this session.
  }
}

function darkMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_QUERY);
}

export function systemPrefersDark(): boolean {
  return darkMedia()?.matches ?? false;
}

export function resolveTheme(
  preference: AppearancePreference,
  prefersDark = systemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Puts the resolved theme on <html>, where every CSS token keys off it. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // index.html paints a first-frame background inline; from here on the
  // stylesheet tokens own it, so theme switches are not pinned to the old one.
  root.style.removeProperty('background-color');
}

/** Runs before React mounts; `index.html` has usually done this already. */
export function initAppearance(): ResolvedTheme {
  const theme = resolveTheme(readPreference());
  applyTheme(theme);
  return theme;
}

/** Calls `listener` whenever Windows switches between light and dark. */
export function subscribeToSystemTheme(listener: (prefersDark: boolean) => void): () => void {
  const media = darkMedia();
  if (!media) return () => {};
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }
  media.addListener(handler);
  return () => media.removeListener(handler);
}

interface ViewTransitionDocument {
  startViewTransition?: (update: () => void) => unknown;
}

/**
 * Swaps the theme with a short cross-fade where the webview supports view
 * transitions, and instantly otherwise or under reduced motion.
 */
export function switchThemeSmoothly(update: () => void): void {
  const doc = document as unknown as ViewTransitionDocument;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  doc.startViewTransition(update);
}
