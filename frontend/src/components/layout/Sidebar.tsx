import {
  AppstoreOutlined,
  BankOutlined,
  GoldOutlined,
  FileTextOutlined,
  FlagOutlined,
  LockOutlined,
  PieChartOutlined,
  RetweetOutlined,
  TagsOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/common/BrandMark';
import { FxStatusBadge } from './FxStatusBadge';

const MAIN_ITEMS = [
  { key: '/', icon: <AppstoreOutlined />, label: 'Overview' },
  { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
  { key: '/recurring', icon: <RetweetOutlined />, label: 'Recurring' },
  { key: '/accounts', icon: <BankOutlined />, label: 'Accounts' },
  { key: '/assets', icon: <GoldOutlined />, label: 'Assets' },
];

const PLAN_ITEMS = [
  { key: '/goals', icon: <FlagOutlined />, label: 'Goals' },
  { key: '/budget', icon: <PieChartOutlined />, label: 'Budget' },
  { key: '/categories', icon: <TagsOutlined />, label: 'Categories' },
  { key: '/reports', icon: <FileTextOutlined />, label: 'Reports' },
];

const SYSTEM_ITEMS = [{ key: '/settings', icon: <SettingOutlined />, label: 'Settings' }];

const ALL_KEYS = [...MAIN_ITEMS, ...PLAN_ITEMS, ...SYSTEM_ITEMS].map((item) => item.key);

const NAV: MenuProps['items'] = [
  { type: 'group', key: 'money', label: 'Money', children: MAIN_ITEMS },
  { type: 'group', key: 'plan', label: 'Planning', children: PLAN_ITEMS },
];

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  const match = ALL_KEYS.find((key) => key !== '/' && pathname.startsWith(key));
  return match ?? '/';
}

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selected = [selectedKey(pathname)];
  const go: MenuProps['onClick'] = ({ key }) => navigate(key);

  return (
    <nav className="oi-sidebar" aria-label="Main">
      <div className="oi-brand">
        <BrandMark className="oi-brand-mark" />
        <div>
          <div className="oi-brand-name">OpenISave</div>
          <div className="oi-brand-version">v{__APP_VERSION__} · Local</div>
        </div>
      </div>
      <Menu
        mode="inline"
        theme="light"
        selectedKeys={selected}
        items={NAV}
        onClick={go}
        className="oi-menu"
      />
      <div className="oi-sidebar-spacer" />
      <Menu
        mode="inline"
        theme="light"
        selectedKeys={selected}
        items={SYSTEM_ITEMS}
        onClick={go}
        className="oi-menu"
      />
      <div className="oi-sidebar-footer">
        <div className="oi-sidebar-status">
          <LockOutlined />
          <span>Encrypted on this computer, reporting in CNY</span>
        </div>
        <FxStatusBadge />
      </div>
    </nav>
  );
}
