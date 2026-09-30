import { ConfigProvider } from 'antd';
import type { Locale } from 'antd/es/locale';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { createTheme } from './antdTheme';
import {
  applyTheme,
  readPreference,
  resolveTheme,
  subscribeToSystemTheme,
  switchThemeSmoothly,
  systemPrefersDark,
  writePreference,
  type AppearancePreference,
} from './appearance';
import { AppearanceContext } from './themeContext';

interface ThemeProviderProps {
  children: ReactNode;
  locale?: Locale;
}

/**
 * Owns the Light / Dark / System choice: persists it, follows Windows while
 * on System, keeps `<html data-theme>` in step, and hands Ant Design the
 * matching theme.
 */
export function ThemeProvider({ children, locale }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(readPreference);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => subscribeToSystemTheme(setPrefersDark), []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: AppearancePreference) => {
    writePreference(next);
    const nextResolved = resolveTheme(next, systemPrefersDark());
    switchThemeSmoothly(() => {
      applyTheme(nextResolved);
      flushSync(() => setPreferenceState(next));
    });
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  const antdTheme = useMemo(() => createTheme(resolved), [resolved]);

  return (
    <AppearanceContext.Provider value={value}>
      <ConfigProvider theme={antdTheme} locale={locale}>
        {children}
      </ConfigProvider>
    </AppearanceContext.Provider>
  );
}
