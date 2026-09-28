import { Button, Card, Popconfirm, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { MoneyText } from '@/components/common/MoneyText';
import { useIgnoredItems, useRestoreIgnored } from '@/hooks/useImports';
import type { IgnoredItem } from '@/types/imports';
import { formatDate } from '@/utils/dates';

/**
 * Statement rows ignored permanently. Restoring one only forgets the ignore;
 * the row is offered again the next time a statement containing it is imported.
 */
export function IgnoredItems() {
  const { data, isLoading } = useIgnoredItems();
  const restore = useRestoreIgnored();
  if (!isLoading && (data ?? []).length === 0) return null;

  const columns: ColumnsType<IgnoredItem> = [
    { title: 'Date', width: 120, render: (_, item) => formatDate(item.source_date) },
    {
      title: 'Merchant',
      render: (_, item) => (
        <div className="oi-import-merchant">
          <span>{item.raw_merchant || item.raw_type || '—'}</span>
          <span className="oi-row-meta">
            {[item.raw_type, item.raw_product].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      title: 'Amount',
      align: 'right',
      width: 120,
      render: (_, item) =>
        item.amount_minor !== null && item.currency ? (
          <MoneyText amountMinor={item.amount_minor} currency={item.currency} />
        ) : (
          '—'
        ),
    },
    {
      title: 'WeChat transaction',
      width: 250,
      render: (_, item) => <span className="oi-rule-pattern">{item.external_id}</span>,
    },
    {
      title: '',
      width: 100,
      align: 'right',
      render: (_, item) => (
        <Popconfirm
          title="Restore this row?"
          description="It will be offered again the next time it appears in a statement."
          okText="Restore"
          onConfirm={() => restore.mutate(item.id)}
        >
          <Button size="small" type="link">
            Restore
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title="Ignored items"
      extra={<span className="oi-row-meta">Ignored permanently; never imported</span>}
      variant="borderless"
      className="oi-section-gap"
      styles={{ body: { padding: 0 } }}
    >
      <Table<IgnoredItem>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        columns={columns}
        pagination={(data ?? []).length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
      />
    </Card>
  );
}
