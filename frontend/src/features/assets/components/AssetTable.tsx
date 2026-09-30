import { Button, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';

import type { Asset } from '@/types/asset';
import { formatDate } from '@/utils/dates';
import { formatMoney } from '@/utils/money';
import { NetWorthBadge } from './NetWorthBadge';

interface AssetTableProps {
  rows: Asset[];
  loading?: boolean;
  sold?: boolean;
  onSell?: (asset: Asset) => void;
  onValue?: (asset: Asset) => void;
}

export function AssetTable({ rows, loading, sold = false, onSell, onValue }: AssetTableProps) {
  const navigate = useNavigate();

  const columns: ColumnsType<Asset> = [
    {
      title: 'Asset',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span className="oi-strong">{row.name}</span>
          <span className="oi-meta">
            {row.category_name ?? 'Uncategorised'}
            {row.liability_name ? ` · financed by ${row.liability_name}` : ''}
          </span>
          {sold ? null : <NetWorthBadge asset={row} />}
        </Space>
      ),
    },
    {
      title: 'Bought',
      width: 120,
      render: (_, row) => <span className="oi-nowrap">{formatDate(row.purchase_date)}</span>,
    },
    {
      title: 'Purchase price',
      align: 'right',
      width: 140,
      render: (_, row) => formatMoney(row.purchase_price_minor, row.purchase_currency),
    },
  ];

  if (sold) {
    columns.push(
      {
        title: 'Sold',
        width: 120,
        render: (_, row) => <span className="oi-nowrap">{formatDate(row.sale_date)}</span>,
      },
      {
        title: 'Sale price',
        align: 'right',
        width: 130,
        render: (_, row) =>
          formatMoney(row.sale_price_minor, row.sale_currency ?? row.purchase_currency),
      },
      {
        title: 'Net cost',
        align: 'right',
        width: 130,
        render: (_, row) => (
          <Tooltip title="Purchase price minus what you got back">
            <span className={(row.net_cost_minor ?? 0) < 0 ? 'oi-positive' : ''}>
              {formatMoney(row.net_cost_minor, row.purchase_currency)}
            </span>
          </Tooltip>
        ),
      },
      {
        title: 'Days held',
        align: 'right',
        width: 100,
        render: (_, row) => row.days_held.toLocaleString(),
      },
      {
        title: 'Effective / day',
        align: 'right',
        width: 140,
        render: (_, row) =>
          formatMoney(row.effective_cost_per_day_minor, row.purchase_currency),
      },
    );
  } else {
    columns.push(
      {
        title: 'Current value',
        align: 'right',
        width: 160,
        render: (_, row) =>
          row.current_value ? (
            <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
              <span>{formatMoney(row.current_value.value_minor, row.current_value.currency)}</span>
              {row.current_value.source === 'purchase_price' ? (
                <Tooltip title="No valuation recorded yet, so the purchase price is shown">
                  <span className="oi-meta">
                    using purchase value
                  </span>
                </Tooltip>
              ) : (
                <span className="oi-meta">
                  valued {formatDate(row.current_value.valuation_date)}
                </span>
              )}
            </Space>
          ) : (
            '—'
          ),
      },
      {
        title: 'Days held',
        align: 'right',
        width: 100,
        render: (_, row) => row.days_held.toLocaleString(),
      },
      {
        title: 'Holding cost / day',
        align: 'right',
        width: 150,
        render: (_, row) =>
          formatMoney(row.holding_cost_per_day_minor, row.purchase_currency),
      },
      {
        title: '',
        width: 190,
        align: 'right',
        render: (_, row) => (
          <Space size={2}>
            <Button size="small" type="link" onClick={() => navigate(`/assets/${row.id}`)}>
              Details
            </Button>
            {onValue ? (
              <Button size="small" type="link" onClick={() => onValue(row)}>
                Value
              </Button>
            ) : null}
            {onSell ? (
              <Button size="small" type="link" onClick={() => onSell(row)}>
                Sell
              </Button>
            ) : null}
          </Space>
        ),
      },
    );
  }

  return (
    <Table<Asset>
      rowKey="id"
      size="middle"
      loading={loading}
      dataSource={rows}
      columns={columns}
      pagination={false}
      onRow={(row) => (sold ? { onClick: () => navigate(`/assets/${row.id}`), className: 'oi-clickable' } : {})}
      locale={{
        emptyText: (
          <span className="oi-muted">{sold ? 'Nothing sold yet' : 'No assets recorded yet'}</span>
        ),
      }}
      footer={
        rows.length > 0 && !sold
          ? () => (
              <Tag bordered={false}>
                {rows.length} item{rows.length === 1 ? '' : 's'} held
              </Tag>
            )
          : undefined
      }
    />
  );
}
