import { describe, expect, it } from 'vitest';

import type { AccountType } from '@/types';
import {
  ACCOUNT_THEME_IDS,
  FALLBACK_THEMES,
  monogramFor,
  resolveAccountTheme,
  stableHash,
} from './accountTheme';

const account = (
  name: string,
  institution: string | null = null,
  account_type: AccountType = 'bank',
) => ({ name, institution, account_type });

describe('account theme resolver', () => {
  it('maps known institutions to their own theme and monogram', () => {
    const cases: [string | null, string, string, string][] = [
      ['HSBC', 'HSBC Current', 'hsbc', 'H'],
      ['汇丰银行', 'Premier', 'hsbc', 'H'],
      ['Bank of China', 'Salary', 'boc', 'BOC'],
      ['中国银行', '工资卡', 'boc', 'BOC'],
      ['招商银行', 'Everyday', 'cmb', 'CMB'],
      ['China Merchants Bank', 'Card', 'cmb', 'CMB'],
      ['Monzo', 'Current', 'monzo', 'M'],
      ['WeChat Pay', 'Wallet', 'wechat', 'W'],
      [null, '微信零钱', 'wechat', 'W'],
      ['支付宝', '余额', 'alipay', 'A'],
    ];
    for (const [institution, name, id, monogram] of cases) {
      const theme = resolveAccountTheme(account(name, institution));
      expect(theme, `${institution} / ${name}`).toMatchObject({ id, monogram, source: 'institution' });
    }
  });

  it('does not confuse China Merchants Bank or Construction Bank with Bank of China', () => {
    expect(resolveAccountTheme(account('Card', 'China Merchants Bank')).id).toBe('cmb');
    expect(resolveAccountTheme(account('Card', '中国建设银行')).id).toBe('ccb');
  });

  it('lets a known institution win over the account type', () => {
    expect(resolveAccountTheme(account('Saver', 'HSBC', 'savings')).id).toBe('hsbc');
    expect(resolveAccountTheme(account('Card', 'Monzo', 'credit_card')).id).toBe('monzo');
  });

  it('falls back to account-type themes for unknown institutions', () => {
    expect(resolveAccountTheme(account('Cash', null, 'cash'))).toMatchObject({ id: 'cash', source: 'type' });
    expect(resolveAccountTheme(account('Saver', 'Harbour Bank', 'savings')).id).toBe('savings');
    expect(resolveAccountTheme(account('Pension', null, 'provident_fund')).id).toBe('savings');
    expect(resolveAccountTheme(account('ISA', 'Meridian', 'investment')).id).toBe('investment');
    expect(resolveAccountTheme(account('Card', 'Harbour', 'credit_card')).id).toBe('credit');
    expect(resolveAccountTheme(account('Mortgage', 'Harbour', 'loan')).id).toBe('credit');
    expect(resolveAccountTheme(account('Flat', null, 'property')).id).toBe('property');
  });

  it('gives unknown banks a deterministic premium fallback palette', () => {
    const ids = FALLBACK_THEMES.map((theme) => theme.id);
    const first = resolveAccountTheme(account('Community Account', 'Lakeside Credit Union'));
    expect(first.source).toBe('fallback');
    expect(ids).toContain(first.id);
    // Same input, same theme, every time (no randomness).
    for (let run = 0; run < 20; run += 1) {
      expect(resolveAccountTheme(account('Community Account', 'Lakeside Credit Union'))).toEqual(first);
    }
    // Case and surrounding whitespace do not change the identity.
    expect(resolveAccountTheme(account(' community account ', 'LAKESIDE CREDIT UNION')).id).toBe(first.id);
  });

  it('spreads different unknown banks across the fallback palettes', () => {
    const used = new Set(
      Array.from({ length: 40 }, (_, index) =>
        resolveAccountTheme(account(`Account ${index}`, `Regional Bank ${index}`)).id,
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(5);
    expect([...used].every((id) => FALLBACK_THEMES.some((theme) => theme.id === id))).toBe(true);
  });

  it('hashes stably across runs', () => {
    expect(stableHash('lakeside credit union|community account')).toBe(
      stableHash('lakeside credit union|community account'),
    );
    expect(stableHash('a')).not.toBe(stableHash('b'));
    expect(stableHash('')).toBe(0x811c9dc5);
  });

  it('builds short typographic monograms', () => {
    expect(monogramFor('Lakeside Credit Union')).toBe('LCU');
    expect(monogramFor('Harbour Bank')).toBe('HB');
    expect(monogramFor('HSBC')).toBe('HSBC');
    expect(monogramFor('Revolut')).toBe('R');
    expect(monogramFor('Bank of the West')).toBe('BW');
    expect(monogramFor('工商银行')).toBe('工');
    expect(monogramFor('  ')).toBe('·');
  });

  it('lists every palette the stylesheet has to define', () => {
    expect(ACCOUNT_THEME_IDS).toEqual(expect.arrayContaining(['hsbc', 'boc', 'cmb', 'monzo', 'wechat']));
    expect(ACCOUNT_THEME_IDS).toEqual(expect.arrayContaining(['cash', 'savings', 'investment', 'credit', 'property']));
    expect(new Set(ACCOUNT_THEME_IDS).size).toBe(ACCOUNT_THEME_IDS.length);
  });
});
