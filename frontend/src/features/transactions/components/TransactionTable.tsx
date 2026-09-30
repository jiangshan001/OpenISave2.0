import { Button, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MoneyText } from '@/components/common/MoneyText';
import { useVoidTransaction } from '@/hooks/useLedger';
import type { Account, Category, Transaction } from '@/types';
import { formatDate } from '@/utils/dates';
import { TRANSACTION_TYPE_COLORS, TRANSACTION_TYPE_LABELS } from '@/utils/labels';

interface TransactionTableProps {
  rows: Transaction[];
  accounts: Account[];
  categories: Category[];
  loading?: boolean;
  onEdit?: (transaction: Transaction) => void;
  pagination?: { total: number; pageSize: number; current: number; onChange: (p: number) => void };
  compact?: boolean;
}

export function TransactionTable({
  rows,
  accounts,
  categories,
  loading,
  onEdit,
  pagination,
  compact = false,
}: TransactionTableProps) {
  const voidTransaction = useVoidTransaction();
  const accountName = (id: number | null) =>
    accounts.find((account) => account.id === id)?.name ?? '—';
  const categoryName = (id: number | null) =>
    categories.find((category) => category.id === id)?.name ?? null;

  const columns: ColumnsType<Transaction> = [
    {
      title: 'Date',
      dataIndex: 'transaction_date',
      width: 118,
      render: (value: string) => <span className="oi-nowrap">{formatDate(value)}</span>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <span className={row.is_voided ? 'oi-muted' : ''}>
            {value || TRANSACTION_TYPE_LABELS[row.type]}
          </span>
          {row.type === 'transfer' ? (
            <span className="oi-muted" style={{ fontSize: 12 }}>
              {accountName(row.from_account_id)} → {accountName(row.to_account_id)}
            </span>
          ) : null}
          {row.is_voided ? <Tag color="default">Voided</Tag> : null}
          {row.external_source || row.recurring_rule_id ? (
            <span className="oi-row-meta">
              {row.external_source === 'wechat' ? 'Imported · WeChat Pay' : null}
              {row.recurring_rule_id ? 'Recurring' : null}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 104,
      render: (value: Transaction['type']) => (
        <Tag color={TRANSACTION_TYPE_COLORS[value]} bordered={false}>
          {TRANSACTION_TYPE_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category_id',
      width: 140,
      render: (value: number | null, row) =>
        row.type === 'transfer' ? (
          <span className="oi-muted">Not categorised</span>
        ) : (
          (categoryName(value) ?? <span className="oi-muted">Uncategorised</span>)
        ),
    },
    {
      title: 'Account',
      width: 150,
      render: (_, row) =>
        row.type === 'transfer'
          ? accountName(row.from_account_id)
          : accountName(row.account_id),
    },
    {
      title: 'Amount',
      align: 'right',
      width: 170,
      render: (_, row) => (
        <MoneyText
          amountMinor={row.type === 'income' ? row.amount_minor : -row.amount_minor}
          currency={row.currency}
          baseAmountMinor={row.base_amount_minor}
          baseCurrency={row.base_currency}
          tone={row.type === 'transfer' || row.is_voided ? 'neutral' : 'auto'}
          signed={row.type !== 'transfer'}
        />
      ),
    },
  ];

  if (!compact) {
    columns.push({
      title: '',
      width: 130,
      align: 'right',
      render: (_, row) =>
        row.is_voided ? null : (
          <Space size={2}>
            {onEdit && row.type !== 'transfer' ? (
              <Button size="small" type="link" onClick={() => onEdit(row)}>
                Edit
              </Button>
            ) : null}
            <Popconfirm
              title="Void this transaction?"
              description="It stays in the history but no longer affects balances."
              okText="Void"
              onConfirm={() => voidTransaction.mutate(row.id)}
            >
              <Button size="small" type="link" danger>
                Void
              </Button>
            </Popconfirm>
          </Space>
        ),
    });
  }

  return (
    <Table<Transaction>
      rowKey="id"
      size={compact ? 'small' : 'middle'}
      loading={loading}
      dataSource={rows}
      columns={columns}
      rowClassName={(row) => (row.is_voided ? 'oi-muted' : '')}
      pagination={
        pagination
          ? {
              total: pagination.total,
              pageSize: pagination.pageSize,
              current: pagination.current,
              onChange: pagination.onChange,
              showSizeChanger: false,
              showTotal: (total) => `${total} transaction${total === 1 ? '' : 's'}`,
            }
          : false
      }
      locale={{
        emptyText: (
          <Tooltip title="Transactions you record will appear here">
            <span className="oi-muted">No transactions yet</span>
          </Tooltip>
        ),
      }}
    />
  );
}
