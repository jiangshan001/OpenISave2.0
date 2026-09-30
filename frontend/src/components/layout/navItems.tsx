import {
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  FlagOutlined,
  GoldOutlined,
  PieChartOutlined,
  RetweetOutlined,
  SettingOutlined,
  SwapOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * How an icon answers hover (styles/nav.css). Most items share the quiet
 * default; a few get a small gesture that matches their meaning.
 */
export type NavMotion = 'default' | 'swap' | 'turn' | 'lift' | 'flag' | 'gear';

/** Icon well for a navigation item; decorative, the label names the page. */
export function NavIcon({ motion = 'default', children }: { motion?: NavMotion; children: ReactNode }) {
  return (
    <span className="oi-nav-icon" data-motion={motion} aria-hidden="true">
      {children}
    </span>
  );
}

/** The swap glyph is drawn twice and clipped, so its two arrows can part. */
function SwapGlyph() {
  return (
    <NavIcon motion="swap">
      <span className="oi-nav-swap-top">
        <SwapOutlined />
      </span>
      <span className="oi-nav-swap-bottom">
        <SwapOutlined />
      </span>
    </NavIcon>
  );
}

type NavItem = { key: string; icon: ReactNode; label: string };

export const MAIN_ITEMS: NavItem[] = [
  { key: '/', icon: <NavIcon><AppstoreOutlined /></NavIcon>, label: 'Overview' },
  { key: '/transactions', icon: <SwapGlyph />, label: 'Transactions' },
  { key: '/recurring', icon: <NavIcon motion="turn"><RetweetOutlined /></NavIcon>, label: 'Recurring' },
  { key: '/accounts', icon: <NavIcon motion="lift"><BankOutlined /></NavIcon>, label: 'Accounts' },
  { key: '/assets', icon: <NavIcon><GoldOutlined /></NavIcon>, label: 'Assets' },
];

export const PLAN_ITEMS: NavItem[] = [
  { key: '/goals', icon: <NavIcon motion="flag"><FlagOutlined /></NavIcon>, label: 'Goals' },
  { key: '/budget', icon: <NavIcon><PieChartOutlined /></NavIcon>, label: 'Budget' },
  { key: '/categories', icon: <NavIcon><TagsOutlined /></NavIcon>, label: 'Categories' },
  { key: '/reports', icon: <NavIcon><BarChartOutlined /></NavIcon>, label: 'Reports' },
];

export const SYSTEM_ITEMS: NavItem[] = [
  { key: '/settings', icon: <NavIcon motion="gear"><SettingOutlined /></NavIcon>, label: 'Settings' },
];

export const NAV: MenuProps['items'] = [
  { type: 'group', key: 'money', label: 'Money', children: MAIN_ITEMS },
  { type: 'group', key: 'plan', label: 'Planning', children: PLAN_ITEMS },
];

const ALL_KEYS = [...MAIN_ITEMS, ...PLAN_ITEMS, ...SYSTEM_ITEMS].map((item) => item.key);

export function selectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  const match = ALL_KEYS.find((key) => key !== '/' && pathname.startsWith(key));
  return match ?? '/';
}
