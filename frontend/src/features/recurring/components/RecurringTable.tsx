import { Button, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MoneyText } from '@/components/common/MoneyText';
import { useRecurringStatus } from '@/hooks/useRecurring';
import type { Account, Category } from '@/types';
import type { RecurringRule } from '@/types/recurring';
import { formatDate } from '@/utils/dates';
import { TRANSACTION_TYPE_COLORS, TRANSACTION_TYPE_LABELS } from '@/utils/labels';
import { MODE_LABELS, STATUS_CHIP, describeSchedule } from '../recurringFormat';

interface RecurringTableProps {
  rules: RecurringRule[];
  accounts: Account[];
  categories: Category[];
  loading?: boolean;
  onEdit: (rule: RecurringRule) => void;
}

export function RecurringTable({ rules, accounts, categories, loading, onEdit }: RecurringTableProps) {
  const status = useRecurringStatus();
  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name;

  const columns: ColumnsType<RecurringRule> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, rule) => (
        <Space direction="vertical" size={0}>
          <span className="oi-strong">{name}</span>
          <span className="oi-muted" style={{ fontSize: 12 }}>
            {describeSchedule(rule)}
            {rule.end_date ? ` · until ${formatDate(rule.end_date)}` : ''}
          </span>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'transaction_type',
      width: 100,
      render: (value: RecurringRule['transaction_type']) => (
        <Tag color={TRANSACTION_TYPE_COLORS[value]} bordered={false}>
          {TRANSACTION_TYPE_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      align: 'right',
      width: 130,
      render: (_, rule) => (
        <MoneyText
          amountMinor={rule.transaction_type === 'expense' ? -rule.amount_minor : rule.amount_minor}
          currency={rule.currency}
          tone={rule.transaction_type === 'transfer' ? 'neutral' : 'auto'}
          signed={rule.transaction_type !== 'transfer'}
        />
      ),
    },
    {
      title: 'Next date',
      dataIndex: 'next_run_date',
      width: 140,
      render: (value: string | null, rule) =>
        value ? (
          <Space direction="vertical" size={0}>
            <span className="oi-nowrap">{formatDate(value)}</span>
            {rule.due_count > 0 ? (
              <span className="oi-chip oi-chip--warning">{rule.due_count} due</span>
            ) : null}
          </Space>
        ) : (
          <span className="oi-muted">Finished</span>
        ),
    },
    {
      title: 'Account',
      width: 160,
      render: (_, rule) =>
        rule.transaction_type === 'transfer'
          ? `${accountName(rule.account_id)} → ${accountName(rule.destination_account_id)}`
          : accountName(rule.account_id),
    },
    {
      title: 'Category',
      width: 130,
      render: (_, rule) =>
        rule.transaction_type === 'transfer' ? (
          <span className="oi-muted">—</span>
        ) : (
          (categoryName(rule.category_id) ?? <span className="oi-muted">Uncategorised</span>)
        ),
    },
    {
      title: 'Mode',
      dataIndex: 'mode',
      width: 110,
      render: (value: RecurringRule['mode']) => (
        <span className={`oi-chip ${value === 'automatic' ? 'oi-chip--primary' : ''}`}>
          {MODE_LABELS[value]}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 90,
      render: (value: RecurringRule['status']) => (
        <span className={`oi-chip ${STATUS_CHIP[value].tone}`}>{STATUS_CHIP[value].label}</span>
      ),
    },
    {
      title: '',
      width: 190,
      align: 'right',
      render: (_, rule) =>
        rule.status === 'archived' ? null : (
          <Space size={0}>
            <Button size="small" type="link" onClick={() => onEdit(rule)}>
              Edit
            </Button>
            <Button
              size="small"
              type="link"
              onClick={() =>
                status.mutate({ id: rule.id, action: rule.status === 'active' ? 'pause' : 'resume' })
              }
            >
              {rule.status === 'active' ? 'Pause' : 'Resume'}
            </Button>
            <Popconfirm
              title="Archive this recurring transaction?"
              description="It stops for good. Transactions it already created are kept."
              okText="Archive"
              onConfirm={() => status.mutate({ id: rule.id, action: 'archive' })}
            >
              <Button size="small" type="link" danger>
                Archive
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <Table<RecurringRule>
      rowKey="id"
      size="middle"
      loading={loading}
      dataSource={rules}
      columns={columns}
      pagination={false}
      rowClassName={(rule) => (rule.status === 'archived' ? 'oi-muted' : '')}
      locale={{ emptyText: <span className="oi-muted">No recurring transactions yet</span> }}
    />
  );
}
