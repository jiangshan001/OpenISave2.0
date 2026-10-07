import { LockOutlined } from '@ant-design/icons';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/common/BrandMark';
import { AppearanceSwitch } from '@/theme/AppearanceSwitch';
import { FxStatusBadge } from './FxStatusBadge';
import { NAV, SYSTEM_ITEMS, selectedKey } from './navItems';

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
          <div className="oi-brand-version">Version {__APP_VERSION__}</div>
        </div>
      </div>
      <Menu mode="inline" selectedKeys={selected} items={NAV} onClick={go} className="oi-menu" />
      <div className="oi-sidebar-spacer" />
      <Menu
        mode="inline"
        selectedKeys={selected}
        items={SYSTEM_ITEMS}
        onClick={go}
        className="oi-menu"
      />
      <div className="oi-sidebar-footer">
        <div className="oi-sidebar-row" title="Encrypted on this computer, reporting in CNY">
          <LockOutlined />
          <span>
            <span className="oi-sidebar-row-title">Local &amp; encrypted</span>
            <span className="oi-sidebar-row-meta"> · CNY</span>
          </span>
        </div>
        <FxStatusBadge />
        <div className="oi-sidebar-row oi-sidebar-theme">
          <span>Theme</span>
          <AppearanceSwitch compact size="small" />
        </div>
      </div>
    </nav>
  );
}
