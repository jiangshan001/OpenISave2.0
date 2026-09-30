import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APPEARANCE_STORAGE_KEY,
  initAppearance,
  readPreference,
  resolveTheme,
  subscribeToSystemTheme,
  writePreference,
} from './appearance';
import { mockSystemTheme, type SystemThemeMock } from './mediaMock';

let system: SystemThemeMock;

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => system?.restore());

describe('appearance preference', () => {
  it('defaults to System when nothing (or something invalid) is stored', () => {
    expect(readPreference()).toBe('system');
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'sepia');
    expect(readPreference()).toBe('system');
  });

  it('persists Light and Dark under openisave.appearance', () => {
    writePreference('dark');
    expect(window.localStorage.getItem('openisave.appearance')).toBe('dark');
    expect(readPreference()).toBe('dark');
    writePreference('light');
    expect(readPreference()).toBe('light');
  });

  it('resolves System from the OS and fixed choices as themselves', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('applies the theme to <html> before anything renders', () => {
    system = mockSystemTheme(true);
    expect(initAppearance()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    writePreference('light');
    initAppearance();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('reports Windows switching between light and dark', () => {
    system = mockSystemTheme(false);
    const seen: boolean[] = [];
    const stop = subscribeToSystemTheme((dark) => seen.push(dark));
    system.setDark(true);
    system.setDark(false);
    stop();
    system.setDark(true);
    expect(seen).toEqual([true, false]);
  });
});

describe('index.html boot script', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  it('is inline and runs before the app bundle', () => {
    expect(script).toContain('openisave.appearance');
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  it('has no inline <style> block, which would make the desktop CSP block Ant Design styles', () => {
    // Tauri adds a nonce for inline <style> blocks to style-src; browsers then
    // ignore 'unsafe-inline' and refuse every style tag injected at runtime.
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it('paints the first-frame background through the CSSOM, then hands it to the tokens', () => {
    system = mockSystemTheme(true);
    new Function(script)();
    expect(document.documentElement.style.backgroundColor).not.toBe('');
    initAppearance();
    expect(document.documentElement.style.backgroundColor).toBe('');
  });

  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    [null, false, 'light'],
  ])('stored %s with OS dark=%s paints %s from the first frame', (stored, osDark, expected) => {
    system = mockSystemTheme(osDark);
    if (stored) window.localStorage.setItem(APPEARANCE_STORAGE_KEY, stored);
    new Function(script)();
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
  });
});
