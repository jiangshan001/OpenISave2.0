import { Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

import { useUpcoming } from '@/hooks/useRecurring';
import { UpcomingList } from '../../recurring/components/UpcomingList';

const VISIBLE = 4;

/**
 * Lightweight Overview card: the next few recurring items. Renders nothing
 * when there are no schedules, so the Overview stays uncluttered.
 */
export function UpcomingCard() {
  const navigate = useNavigate();
  const { data } = useUpcoming(14);
  const items = data ?? [];
  if (items.length === 0) return null;
  const due = items.filter((item) => item.is_due).length;

  return (
    <Card
      title="Upcoming"
      variant="borderless"
      className="oi-card-fill"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/recurring')}>
          {due > 0 ? `${due} due · Review` : 'View all'}
        </Button>
      }
    >
      <UpcomingList items={items.slice(0, VISIBLE)} compact />
      {items.length > VISIBLE ? (
        <div className="oi-row-meta" style={{ paddingTop: 8 }}>
          +{items.length - VISIBLE} more in the next 14 days
        </div>
      ) : null}
    </Card>
  );
}
