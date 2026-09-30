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
  short: string;
  tone: 'success' | 'warning' | 'error' | 'default';
} {
  if (!rates || rates.length === 0) return { label: 'FX unknown', short: 'Unknown', tone: 'default' };
  if (rates.some((rate) => rate.freshness === 'missing')) {
    return { label: 'FX rates missing', short: 'Missing', tone: 'error' };
  }
  if (rates.some((rate) => rate.freshness === 'stale')) {
    return { label: 'FX stale', short: 'Stale', tone: 'warning' };
  }
  return { label: 'FX fresh', short: 'Fresh', tone: 'success' };
}

export function FxStatusBadge() {
  const { data: rates } = useFxRates();
  const refresh = useRefreshFx();
  const status = overallStatus(rates);

  const content = (
    <div className="oi-fx-popover">
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
          {
            title: 'Rate',
            dataIndex: 'rate',
            align: 'right',
            render: (value: string | null) => (value ? Number(value).toFixed(4) : '-'),
          },
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
        className="oi-fx-refresh"
        loading={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        Refresh exchange rates
      </Button>
    </div>
  );

  return (
    <Popover content={content} title="Exchange rates (to CNY)" trigger="click" placement="rightBottom">
      <button
        type="button"
        className="oi-fx-badge"
        aria-label={`Exchange rate status: ${status.label}`}
      >
        <GlobalOutlined />
        <span>Exchange rates</span>
        <Tag color={status.tone} bordered={false}>
          {status.short}
        </Tag>
      </button>
    </Popover>
  );
}
