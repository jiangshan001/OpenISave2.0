import {
  AppstoreOutlined,
  BankOutlined,
  GoldOutlined,
  FileTextOutlined,
  FlagOutlined,
  PieChartOutlined,
  TagsOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Menu } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/common/BrandMark';

const ITEMS = [
  { key: '/', icon: <AppstoreOutlined />, label: 'Overview' },
  { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
  { key: '/accounts', icon: <BankOutlined />, label: 'Accounts' },
  { key: '/assets', icon: <GoldOutlined />, label: 'Assets' },
  { key: '/goals', icon: <FlagOutlined />, label: 'Goals' },
  { key: '/budget', icon: <PieChartOutlined />, label: 'Budget' },
  { key: '/categories', icon: <TagsOutlined />, label: 'Categories' },
  { key: '/reports', icon: <FileTextOutlined />, label: 'Reports' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  const match = ITEMS.find((item) => item.key !== '/' && pathname.startsWith(item.key));
  return match?.key ?? '/';
}

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="oi-sidebar">
      <div className="oi-brand">
        <BrandMark className="oi-brand-mark" />
        <div>
          <div className="oi-brand-name">OpenISave</div>
          <div className="oi-brand-version">2.0 · Local</div>
        </div>
      </div>
      <Menu
        mode="inline"
        theme="light"
        selectedKeys={[selectedKey(pathname)]}
        items={ITEMS}
        onClick={({ key }) => navigate(key)}
        className="oi-menu"
      />
    </div>
  );
}
