import { Button, Popconfirm, Progress, Space, Table, Tag, Tooltip } from 'antd';

import { useDeleteLiability } from '@/hooks/useAssets';
import type { Liability } from '@/types/asset';
import { formatMoney, formatPercent } from '@/utils/money';

const TYPE_LABELS: Record<string, string> = {
  financing: 'Financing',
  loan: 'Loan',
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
  other: 'Other',
};

interface LiabilityTableProps {
  rows: Liability[];
  loading?: boolean;
  onEdit: (liability: Liability) => void;
  onRepay: (liability: Liability) => void;
}

export function LiabilityTable({ rows, loading, onEdit, onRepay }: LiabilityTableProps) {
  const remove = useDeleteLiability();

  return (
    <Table<Liability>
      rowKey="id"
      size="middle"
      loading={loading}
      dataSource={rows}
      pagination={false}
      locale={{ emptyText: <span className="oi-muted">No loans or financing recorded</span> }}
      columns={[
        {
          title: 'Liability',
          render: (_, row) => (
            <Space direction="vertical" size={0}>
              <span className="oi-strong">{row.name}</span>
              <span className="oi-meta">
                {TYPE_LABELS[row.liability_type] ?? row.liability_type}
                {row.lender ? ` · ${row.lender}` : ''}
                {row.linked_asset_names.length > 0
                  ? ` · for ${row.linked_asset_names.join(', ')}`
                  : ''}
              </span>
            </Space>
          ),
        },
        {
          title: 'Account',
          width: 150,
          render: (_, row) => (
            <Tooltip title="The account that holds this debt — the single source of truth for what you owe">
              <Tag bordered={false}>{row.account_name}</Tag>
            </Tooltip>
          ),
        },
        {
          title: 'Original',
          align: 'right',
          width: 130,
          render: (_, row) => formatMoney(row.original_amount_minor, row.currency),
        },
        {
          title: 'Outstanding',
          align: 'right',
          width: 140,
          render: (_, row) => (
            <span className="oi-negative oi-strong">
              {formatMoney(row.outstanding_minor, row.currency)}
            </span>
          ),
        },
        {
          title: 'Repaid',
          width: 180,
          render: (_, row) => (
            <Space direction="vertical" size={2} className="oi-full">
              <Progress
                percent={Math.min(row.repaid_percent ?? 0, 100)}
                size="small"
                showInfo={false}
              />
              <span className="oi-meta">
                {formatMoney(row.repaid_minor, row.currency)} ({formatPercent(row.repaid_percent)})
              </span>
            </Space>
          ),
        },
        {
          title: '',
          width: 190,
          align: 'right',
          render: (_, row) => (
            <Space size={2}>
              <Button size="small" type="link" onClick={() => onRepay(row)}>
                Repay
              </Button>
              <Button size="small" type="link" onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Popconfirm
                title="Remove this liability?"
                description="The account and its balance history are kept."
                okText="Remove"
                onConfirm={() => remove.mutate(row.id)}
              >
                <Button size="small" type="link" danger>
                  Remove
                </Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]}
    />
  );
}
