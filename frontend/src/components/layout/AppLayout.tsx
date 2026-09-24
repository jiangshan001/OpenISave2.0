import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

import { FxStatusBadge } from './FxStatusBadge';
import { MigrationNotice } from './MigrationNotice';
import { Sidebar } from './Sidebar';

const { Sider, Content, Header } = Layout;

export function AppLayout() {
  return (
    <Layout className="oi-shell">
      <Sider width={228} theme="light" className="oi-sider">
        <Sidebar />
      </Sider>
      <Layout className="oi-main">
        <Header className="oi-header">
          <span className="oi-header-note">
            Local-first · encrypted on this computer · reporting in CNY
          </span>
          <FxStatusBadge />
        </Header>
        <MigrationNotice />
        <Content className="oi-content">
          <div className="oi-content-inner">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
