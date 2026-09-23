import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="oi-page-header">
      <div>
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
        {subtitle ? <Text type="secondary">{subtitle}</Text> : null}
      </div>
      {actions ? <Space wrap>{actions}</Space> : null}
    </div>
  );
}
