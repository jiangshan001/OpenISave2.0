import { InboxOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Main line, e.g. "No budget set for this month". */
  title: ReactNode;
  /** Optional helper sentence explaining how to populate the panel. */
  text?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

/** Compact in-card empty state: glyph, one line, optional hint and action. */
export function EmptyState({ title, text, icon, action }: EmptyStateProps) {
  return (
    <div className="oi-empty">
      <span className="oi-empty-icon" aria-hidden>
        {icon ?? <InboxOutlined />}
      </span>
      <div className="oi-empty-title">{title}</div>
      {text ? <div className="oi-empty-text">{text}</div> : null}
      {action}
    </div>
  );
}
