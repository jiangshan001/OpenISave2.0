/*
 * Account identity themes: presentation only. Each account resolves to a
 * palette id (colours live in styles/accountThemes.css, per light and dark
 * theme), an abstract background motif and a short typographic monogram.
 *
 * Resolution order: known institution → account type → a deterministic
 * fallback palette picked by a stable hash of institution + account name.
 * Nothing here is random and nothing is written back to the vault.
 *
 * Institution themes are inspired by a bank's palette only; no logo, mark or
 * brand artwork is reproduced.
 */
import type { AccountType } from '@/types';

export type AccountMotif =
  | 'lattice'
  | 'arcs'
  | 'ribbon'
  | 'stack'
  | 'dots'
  | 'pinstripe'
  | 'wave'
  | 'rise'
  | 'diagonal'
  | 'contour';

export type AccountThemeSource = 'institution' | 'type' | 'fallback';

export interface AccountTheme {
  /** Palette id, rendered as `data-acct` and styled in accountThemes.css. */
  id: string;
  source: AccountThemeSource;
  motif: AccountMotif;
  /** One to four characters shown in the identity well. */
  monogram: string;
}

export interface AccountThemeInput {
  name: string;
  institution: string | null;
  account_type: AccountType;
}

interface InstitutionTheme {
  id: string;
  match: RegExp;
  motif: AccountMotif;
  monogram: string;
}

/** Order matters: the first match wins. */
export const INSTITUTION_THEMES: readonly InstitutionTheme[] = [
  { id: 'hsbc', match: /hsbc|汇丰/i, motif: 'lattice', monogram: 'H' },
  { id: 'cmb', match: /china merchants|招商银行|招行|\bcmb\b/i, motif: 'ribbon', monogram: 'CMB' },
  { id: 'boc', match: /bank of china|中国银行|中行|\bboc\b/i, motif: 'arcs', monogram: 'BOC' },
  { id: 'ccb', match: /construction bank|建设银行|建行|\bccb\b/i, motif: 'rise', monogram: 'CCB' },
  { id: 'monzo', match: /monzo/i, motif: 'stack', monogram: 'M' },
  { id: 'barclays', match: /barclays|巴克莱/i, motif: 'wave', monogram: 'B' },
  { id: 'wechat', match: /wechat|weixin|微信|零钱/i, motif: 'dots', monogram: 'W' },
  { id: 'alipay', match: /alipay|支付宝|余额宝/i, motif: 'arcs', monogram: 'A' },
];

const TYPE_THEMES: Partial<Record<AccountType, { id: string; motif: AccountMotif }>> = {
  cash: { id: 'cash', motif: 'pinstripe' },
  savings: { id: 'savings', motif: 'wave' },
  provident_fund: { id: 'savings', motif: 'wave' },
  investment: { id: 'investment', motif: 'rise' },
  credit_card: { id: 'credit', motif: 'diagonal' },
  loan: { id: 'credit', motif: 'diagonal' },
  other_liability: { id: 'credit', motif: 'diagonal' },
  property: { id: 'property', motif: 'contour' },
};

/** Premium fallback palettes for institutions without their own theme. */
export const FALLBACK_THEMES: readonly { id: string; motif: AccountMotif }[] = [
  { id: 'navy', motif: 'rise' },
  { id: 'teal', motif: 'wave' },
  { id: 'burgundy', motif: 'lattice' },
  { id: 'violet', motif: 'arcs' },
  { id: 'slate', motif: 'contour' },
  { id: 'amber', motif: 'dots' },
  { id: 'forest', motif: 'ribbon' },
];

/** Every palette id the stylesheet must define, for light and dark. */
export const ACCOUNT_THEME_IDS: readonly string[] = [
  ...new Set([
    ...INSTITUTION_THEMES.map((theme) => theme.id),
    ...Object.values(TYPE_THEMES).map((theme) => theme!.id),
    ...FALLBACK_THEMES.map((theme) => theme.id),
  ]),
];

/** FNV-1a over UTF-16 code units: small, fast and identical on every run. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const CJK = /[㐀-鿿]/;
const STOP_WORDS = new Set(['the', 'of', 'and', '&']);

/** Short typographic initials: "Lakeside Credit Union" → "LCU", "HSBC" → "HSBC". */
export function monogramFor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '·';
  const first = [...trimmed][0];
  if (CJK.test(first)) return first;
  const words = trimmed
    .split(/[\s\-_/.,()]+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()) && /\p{L}|\p{N}/u.test(word));
  if (words.length === 0) return first.toUpperCase();
  if (words.length === 1) {
    const word = words[0];
    return /^[A-Z]{2,4}$/.test(word) ? word : [...word][0].toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => [...word][0].toUpperCase())
    .join('');
}

export function resolveAccountTheme(account: AccountThemeInput): AccountTheme {
  const institution = account.institution?.trim() ?? '';
  const haystack = `${institution} ${account.name}`;
  const known = INSTITUTION_THEMES.find((theme) => theme.match.test(haystack));
  if (known) {
    return { id: known.id, source: 'institution', motif: known.motif, monogram: known.monogram };
  }

  const monogram = monogramFor(institution || account.name);
  const byType = TYPE_THEMES[account.account_type];
  if (byType) return { ...byType, source: 'type', monogram };

  const key = `${institution.toLowerCase()}|${account.name.trim().toLowerCase()}`;
  const fallback = FALLBACK_THEMES[stableHash(key) % FALLBACK_THEMES.length];
  return { ...fallback, source: 'fallback', monogram };
}
