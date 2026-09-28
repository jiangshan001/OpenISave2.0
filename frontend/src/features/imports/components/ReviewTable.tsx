import { CheckCircleFilled, QuestionCircleFilled } from '@ant-design/icons';
import { Button, Popover, Segmented, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { MoneyText } from '@/components/common/MoneyText';
import type { Account, Category } from '@/types';
import type { ImportRow, ImportRowStatus, RowOverride } from '@/types/imports';
import { formatDate } from '@/utils/dates';
import { TRANSACTION_TYPE_COLORS, TRANSACTION_TYPE_LABELS } from '@/utils/labels';
import { buildCategoryOptions } from '../../transactions/categoryOptions';
import { RowResolver } from './RowResolver';

function statusOf(row: ImportRow): { label: string; tone: string } {
  if (row.ignore_state === 'permanent') return { label: 'Ignored permanently', tone: '' };
  if (row.ignore_state === 'pending') return { label: 'Will be ignored', tone: 'oi-chip--warning' };
  return STATUS[row.status];
}

const STATUS: Record<ImportRowStatus, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: 'oi-chip--positive' },
  needs_review: { label: 'Needs review', tone: 'oi-chip--warning' },
  duplicate: { label: 'Already imported', tone: '' },
  ignored: { label: 'Ignored', tone: '' },
  skipped: { label: 'Skipped', tone: '' },
};

type Filter = 'review' | 'all' | 'ready' | 'duplicate' | 'other';

interface ReviewTableProps {
  rows: ImportRow[];
  overrides: Record<number, RowOverride>;
  accounts: Account[];
  categories: Category[];
  loading: boolean;
  onOverride: (rowId: number, override: Omit<RowOverride, 'row_id'> | null) => void;
}

export function ReviewTable(props: ReviewTableProps) {
  const { rows, overrides, accounts, categories, loading, onOverride } = props;
  const reviewCount = rows.filter((r) => r.status === 'needs_review').length;
  const [filter, setFilter] = useState<Filter>(reviewCount ? 'review' : 'all');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryLabel = new Map(buildCategoryOptions(categories).map((o) => [o.value, o.label]));

  const visible = rows.filter((row) => {
    if (filter === 'review') return row.status === 'needs_review';
    if (filter === 'ready') return row.status === 'ready';
    if (filter === 'duplicate') return row.status === 'duplicate';
    if (filter === 'other') return row.status === 'ignored' || row.status === 'skipped';
    return true;
  });

  const resolver = (row: ImportRow) => (
    <Popover
      trigger="click"
      placement="left"
      open={openRow === row.row_id}
      onOpenChange={(open) => setOpenRow(open ? row.row_id : null)}
      content={
        <RowResolver
          key={`${row.row_id}-${openRow}`}
          row={row}
          current={overrides[row.row_id]}
          categories={categories}
          accounts={accounts}
          onApply={(override) => {
            setOpenRow(null);
            onOverride(row.row_id, override);
          }}
        />
      }
    >
      <Button size="small" type={row.status === 'needs_review' ? 'primary' : 'link'}>
        {row.status === 'needs_review' ? 'Resolve' : 'Change'}
      </Button>
    </Popover>
  );

  const columns: ColumnsType<ImportRow> = [
    {
      title: 'Date',
      width: 110,
      render: (_, row) => (
        <Tooltip title={`${row.occurred_at} · ${row.source_timezone} calendar date`}>
          <span className="oi-nowrap">{formatDate(row.transaction_date)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Merchant',
      render: (_, row) => (
        <div className="oi-import-merchant">
          <span className="oi-strong">{row.counterparty || row.source_type}</span>
          <span className="oi-row-meta">
            {[row.counterparty ? row.source_type : null, row.product, row.note, row.remark]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ),
    },
    {
      title: 'Type',
      width: 96,
      render: (_, row) =>
        row.kind ? (
          <Tag color={TRANSACTION_TYPE_COLORS[row.kind]} bordered={false}>
            {TRANSACTION_TYPE_LABELS[row.kind]}
          </Tag>
        ) : (
          <Tag bordered={false}>?</Tag>
        ),
    },
    {
      title: 'Amount',
      align: 'right',
      width: 120,
      render: (_, row) => (
        <MoneyText
          amountMinor={
            row.kind !== 'transfer' && row.direction === 'expense' ? -row.amount_minor : row.amount_minor
          }
          currency={row.currency}
          tone={row.kind === 'income' ? 'positive' : 'neutral'}
          signed={row.kind !== 'transfer' && row.direction !== 'neutral'}
        />
      ),
    },
    {
      title: 'Payment → account',
      width: 190,
      render: (_, row) => (
        <div className="oi-import-merchant">
          <span className="oi-row-meta">{row.payment_method || row.source_label || '—'}</span>
          <span>
            {row.kind === 'transfer'
              ? `${accountName(row.account_id)} → ${accountName(row.counter_account_id)}`
              : accountName(row.account_id)}
          </span>
        </div>
      ),
    },
    {
      title: 'Category',
      width: 200,
      render: (_, row) => {
        if (row.kind === 'transfer') return <span className="oi-muted">Transfer · no category</span>;
        const label = row.category_id ? categoryLabel.get(row.category_id) : null;
        return label ? (
          <Tooltip title={row.reason}>
            <span>
              {row.method === 'rule' ? <CheckCircleFilled className="oi-positive" /> : null} {label}
            </span>
          </Tooltip>
        ) : (
          <span className="oi-muted">
            <QuestionCircleFilled className="oi-warning" /> Choose category
          </span>
        );
      },
    },
    {
      title: 'Status',
      width: 170,
      render: (_, row) => (
        <Tooltip title={[...row.issues, row.reason].filter(Boolean).join(' · ')}>
          <div className="oi-import-merchant">
            <span className={`oi-chip ${statusOf(row).tone}`}>{statusOf(row).label}</span>
            <span className="oi-row-meta oi-import-reason">
              {row.issues[0] ?? (row.method === 'rule' ? `Rule: ${row.rule_name}` : row.reason)}
            </span>
          </div>
        </Tooltip>
      ),
    },
    {
      title: '',
      width: 92,
      align: 'right',
      render: (_, row) =>
        row.status === 'duplicate' || (row.status === 'ignored' && !overrides[row.row_id])
          ? null
          : resolver(row),
    },
  ];

  return (
    <>
      <div className="oi-import-filter">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'review', label: `Needs review · ${reviewCount}` },
            { value: 'all', label: `All · ${rows.length}` },
            { value: 'ready', label: 'Ready' },
            { value: 'duplicate', label: 'Already imported' },
            { value: 'other', label: 'Ignored / skipped' },
          ]}
        />
      </div>
      <Table<ImportRow>
        rowKey="row_id"
        size="small"
        loading={loading}
        dataSource={visible}
        columns={columns}
        pagination={visible.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        rowClassName={(row) => (row.status === 'duplicate' || row.status === 'ignored' ? 'oi-muted' : '')}
        locale={{ emptyText: <span className="oi-muted">Nothing in this view</span> }}
      />
    </>
  );
}
