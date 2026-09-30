/**
 * Test helper: a controllable `prefers-color-scheme` media query, so tests can
 * play the part of Windows switching between light and dark.
 */
type Listener = (event: MediaQueryListEvent) => void;

export interface SystemThemeMock {
  setDark: (dark: boolean) => void;
  restore: () => void;
}

export function mockSystemTheme(initiallyDark: boolean): SystemThemeMock {
  const original = window.matchMedia;
  let dark = initiallyDark;
  const listeners = new Set<Listener>();

  window.matchMedia = ((query: string) => {
    const isScheme = query.includes('prefers-color-scheme: dark');
    return {
      get matches() {
        return isScheme ? dark : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Listener) => isScheme && listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => isScheme && listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    setDark(next) {
      dark = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
