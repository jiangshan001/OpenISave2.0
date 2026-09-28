import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

import { useProcessDueOnLaunch } from '@/hooks/useRecurring';

import { MigrationNotice } from './MigrationNotice';
import { Sidebar } from './Sidebar';

const { Sider, Content } = Layout;

export function AppLayout() {
  useProcessDueOnLaunch();
  return (
    <Layout className="oi-shell">
      <Sider width={232} theme="light" className="oi-sider">
        <Sidebar />
      </Sider>
      <Layout className="oi-main">
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
