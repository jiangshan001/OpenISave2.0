import { PieChartOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { BudgetProgress } from '@/features/budgets/components/BudgetProgress';
import type { Dashboard } from '@/types/dashboard';

export function BudgetUsageCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const { budget, base_currency: currency } = data;
  const overall = budget.overall_limit_minor !== null;
  const count = budget.lines.length;
  return (
    <Card title={overall ? 'Monthly budget' : 'Budget'} variant="borderless" className="oi-card-fill"
      extra={<Button type="link" size="small" onClick={() => navigate('/budget')}>
        {overall || count ? 'Manage' : 'Set up'}
      </Button>}>
      {overall ? <BudgetProgress budget={budget} currency={currency} /> : count === 0 ? (
        <EmptyState icon={<PieChartOutlined />} title="Set your monthly budget"
          text="Decide how much you want to spend this month."
          action={<Button size="small" onClick={() => navigate('/budget')}>Set budget</Button>} />
      ) : null}
      {count > 0 ? (
        <div className="oi-line-head oi-section-gap">
          <span>Category budgets <span className="oi-muted">· {count} active</span></span>
          <Button type="link" size="small" onClick={() => navigate('/budget')}>
            {overall ? 'Manage categories' : 'Set overall budget'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
