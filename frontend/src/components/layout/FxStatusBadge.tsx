import { GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Popover, Table, Tag } from 'antd';

import { useFxRates, useRefreshFx } from '@/hooks/useResources';
import type { FxRateStatus } from '@/types';
import { formatDate } from '@/utils/dates';

const TONE: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  fresh: 'success',
  stale: 'warning',
  missing: 'error',
  identity: 'default',
};

function overallStatus(rates: FxRateStatus[] | undefined): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'default';
} {
  if (!rates || rates.length === 0) return { label: 'FX unknown', tone: 'default' };
  if (rates.some((rate) => rate.freshness === 'missing')) {
    return { label: 'FX rates missing', tone: 'error' };
  }
  if (rates.some((rate) => rate.freshness === 'stale')) {
    return { label: 'FX stale', tone: 'warning' };
  }
  return { label: 'FX fresh', tone: 'success' };
}

export function FxStatusBadge() {
  const { data: rates } = useFxRates();
  const refresh = useRefreshFx();
  const status = overallStatus(rates);

  const content = (
    <div style={{ width: 380 }}>
      <Table<FxRateStatus>
        size="small"
        pagination={false}
        rowKey={(row) => row.from_currency}
        dataSource={rates ?? []}
        columns={[
          {
            title: 'Pair',
            render: (_, row) => `${row.from_currency}/${row.to_currency}`,
          },
          { title: 'Rate', dataIndex: 'rate', render: (value: string | null) => value ? Number(value).toFixed(4) : '—' },
          { title: 'Updated', dataIndex: 'rate_date', render: (value: string | null) => formatDate(value) },
          {
            title: 'Status',
            dataIndex: 'freshness',
            render: (value: string) => <Tag color={TONE[value]}>{value}</Tag>,
          },
        ]}
      />
      <Button
        icon={<ReloadOutlined />}
        size="small"
        block
        style={{ marginTop: 12 }}
        loading={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        Refresh exchange rates
      </Button>
    </div>
  );

  return (
    <Popover content={content} title="Exchange rates (to CNY)" trigger="click" placement="rightBottom">
      <button type="button" className="oi-fx-badge" aria-label="Exchange rate status">
        <GlobalOutlined />
        <Tag color={status.tone} bordered={false}>
          {status.label}
        </Tag>
      </button>
    </Popover>
  );
}
