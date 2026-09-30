import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_THEME_IDS } from './accountTheme';
import { GOAL_KINDS } from './goalTheme';
import { DARK_PALETTE, LIGHT_PALETTE } from './palette';

const STYLES = resolve(__dirname, '../styles');
const css = (name: string) => readFileSync(join(STYLES, name), 'utf-8');

/** `[data-acct='x'] { --acct: #hex; }` → { x: '#hex' }, split by theme. */
function palette(text: string, attribute: string, variable: string) {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  const rule = new RegExp(
    `^(\\[data-theme='dark'\\] )?\\[${attribute}='([\\w-]+)'\\] \\{ ${variable}: (#[0-9a-f]{6});`,
    'gm',
  );
  for (const match of text.matchAll(rule)) (match[1] ? dark : light)[match[2]] = match[3];
  return { light, dark };
}

const channels = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));

function mix(foreground: string, background: string, amount: number): string {
  const [f, b] = [channels(foreground), channels(background)];
  return `#${f
    .map((value, index) => Math.round(value * amount + b[index] * (1 - amount)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('account theme styles', () => {
  const { light, dark } = palette(css('accountThemes.css'), 'data-acct', '--acct');

  it('defines every account palette for both light and dark', () => {
    expect(ACCOUNT_THEME_IDS.filter((id) => !light[id])).toEqual([]);
    expect(ACCOUNT_THEME_IDS.filter((id) => !dark[id])).toEqual([]);
  });

  it('keeps each monogram at WCAG AA against its tinted well in both themes', () => {
    for (const id of ACCOUNT_THEME_IDS) {
      const lightWell = mix(light[id], LIGHT_PALETTE.surface, 0.09);
      const darkWell = mix(dark[id], DARK_PALETTE.surface, 0.09);
      expect(contrast(light[id], lightWell), `${id} light`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark[id], darkWell), `${id} dark`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps patterns faint, and fainter in dark', () => {
    const text = css('accountThemes.css');
    const opacity = (selector: string) =>
      Number(text.split(selector)[1].match(/--acct-motif: ([\d.]+);/)?.[1]);
    const lightMotif = opacity('.oi-account-card.oi-acct {');
    const darkMotif = opacity("[data-theme='dark'] .oi-account-card.oi-acct {");
    expect(lightMotif).toBeGreaterThanOrEqual(0.03);
    expect(lightMotif).toBeLessThanOrEqual(0.08);
    expect(darkMotif).toBeLessThan(lightMotif);
  });

  it('draws no logo artwork: motifs are gradients and one abstract wave only', () => {
    const text = css('accountThemes.css');
    expect(text.match(/url\(/g) ?? []).toHaveLength(1);
    expect(text).not.toMatch(/\.(png|jpe?g|webp|gif)\b/i);
  });
});

describe('goal theme styles', () => {
  const { light, dark } = palette(css('goals.css'), 'data-goal', '--goal');

  it('defines every goal kind for both light and dark', () => {
    expect(GOAL_KINDS.filter((kind) => !light[kind])).toEqual([]);
    expect(GOAL_KINDS.filter((kind) => !dark[kind])).toEqual([]);
  });

  it('keeps the goal percentage readable (AA) on the tinted card', () => {
    for (const kind of GOAL_KINDS) {
      expect(contrast(light[kind], mix(light[kind], LIGHT_PALETTE.surface, 0.025))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark[kind], mix(dark[kind], DARK_PALETTE.surface, 0.035))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** Removes `@media (prefers-reduced-motion: no-preference) { … }` and keyframes. */
function withoutMotionBlocks(text: string): string {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const opener of ['@media (prefers-reduced-motion: no-preference)', '@keyframes']) {
    let start = out.indexOf(opener);
    while (start !== -1) {
      let depth = 0;
      let index = out.indexOf('{', start);
      for (; index < out.length; index += 1) {
        if (out[index] === '{') depth += 1;
        if (out[index] === '}' && --depth === 0) break;
      }
      out = out.slice(0, start) + out.slice(index + 1);
      start = out.indexOf(opener);
    }
  }
  return out;
}

describe('reduced motion', () => {
  it.each(['nav.css', 'interactions.css', 'milestones.css', 'accountThemes.css', 'goals.css'])(
    '%s only animates or moves on interaction inside prefers-reduced-motion: no-preference',
    (file) => {
      const rules = [...withoutMotionBlocks(css(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      const offenders = rules
        .filter(([, selector, body]) => {
          const animates = /(^|[;\s])animation(-name)?\s*:(?!\s*none)/.test(body);
          const moves = /:(hover|active|focus)/.test(selector) && /(^|[;\s])transform\s*:/.test(body);
          return animates || moves;
        })
        .map(([, selector]) => selector.trim());
      expect(offenders).toEqual([]);
    },
  );
});
