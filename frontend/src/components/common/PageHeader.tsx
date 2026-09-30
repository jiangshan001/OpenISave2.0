import { Space } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="oi-page-header">
      <div>
        <h1 className="oi-page-title">{title}</h1>
        {subtitle ? <div className="oi-page-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <Space wrap>{actions}</Space> : null}
    </header>
  );
}
