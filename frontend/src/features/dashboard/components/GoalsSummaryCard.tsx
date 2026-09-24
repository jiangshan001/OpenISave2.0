import { Button, Card, Empty, Progress, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

export function GoalsSummaryCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  return (
    <Card
      title="Savings goals"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/goals')}>
          {data.goals.length > 0 ? 'View all' : 'Add goal'}
        </Button>
      }
    >
      {data.goals.length > 0 ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          {data.goals.slice(0, 5).map((goal) => (
            <div key={goal.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="oi-strong">{goal.name}</span>
                <span className="oi-muted">
                  {formatMoney(goal.current_amount_minor, goal.currency)}
                  {goal.target_amount_minor
                    ? ` / ${formatMoney(goal.target_amount_minor, goal.currency)}`
                    : ''}
                </span>
              </div>
              {goal.target_amount_minor ? (
                <Progress
                  percent={Math.min(goal.progress_percent ?? 0, 100)}
                  size="small"
                  format={() => formatPercent(goal.progress_percent)}
                />
              ) : (
                <span className="oi-muted" style={{ fontSize: 12 }}>
                  Accumulating · no target set
                </span>
              )}
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">No savings goals yet</span>}
        >
          <Button size="small" onClick={() => navigate('/goals')}>
            Create a goal
          </Button>
        </Empty>
      )}
    </Card>
  );
}
