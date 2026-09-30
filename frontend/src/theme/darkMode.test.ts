import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTheme } from './antdTheme';
import { DARK_CHARTS, LIGHT_CHARTS } from './chartPalette';
import { DARK_PALETTE, LIGHT_PALETTE } from './palette';

const SRC = resolve(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

describe('dark mode guard rails', () => {
  it('keeps colour literals out of components; palettes live in src/theme only', () => {
    const offenders = walk(SRC)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => !relative(SRC, file).startsWith('theme'))
      .filter((file) => COLOR_LITERAL.test(readFileSync(file, 'utf-8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('defines every colour token for both light and dark', () => {
    const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf-8');
    const block = (selector: string) => {
      const start = css.indexOf(selector);
      return css.slice(start, css.indexOf('}', start));
    };
    const names = (text: string) => new Set(text.match(/--oi-[\w-]+(?=:)/g) ?? []);
    const light = names(block("[data-theme='light'] {"));
    const dark = names(block("[data-theme='dark'] {"));
    expect(light.size).toBeGreaterThan(20);
    expect([...light].filter((name) => !dark.has(name))).toEqual([]);
    expect([...dark].filter((name) => !light.has(name))).toEqual([]);
  });

  it('gives charts and the heatmap a separate, darker-calibrated palette', () => {
    expect(Object.keys(DARK_CHARTS).sort()).toEqual(Object.keys(LIGHT_CHARTS).sort());
    for (const key of ['grid', 'axis', 'cursor', 'dotFill', 'net', 'heatmapHover'] as const) {
      expect(DARK_CHARTS[key]).not.toBe(LIGHT_CHARTS[key]);
    }
    // An empty heatmap day sits close to the dark surface, not light grey.
    expect(DARK_CHARTS.heatmap.expense[0]).not.toBe(LIGHT_CHARTS.heatmap.expense[0]);
    expect(DARK_CHARTS.heatmap.expense[0]).toBe(DARK_CHARTS.heatmap.income[0]);
    expect(DARK_CHARTS.categories).toHaveLength(LIGHT_CHARTS.categories.length);
  });

  it('never uses pure black as the dark canvas', () => {
    expect(DARK_PALETTE.bg.toLowerCase()).not.toBe('#000000');
    expect(DARK_PALETTE.surface).not.toBe(LIGHT_PALETTE.surface);
  });

  it('builds Ant Design dark from the official dark algorithm plus OpenISave tokens', () => {
    const dark = createTheme('dark');
    const light = createTheme('light');
    expect(dark.algorithm).not.toBe(light.algorithm);
    expect(dark.token?.colorBgContainer).toBe(DARK_PALETTE.surface);
    expect(dark.token?.colorBgElevated).not.toBe('#ffffff');
    expect(light.token?.colorBgLayout).toBe(LIGHT_PALETTE.bg);
  });
});
