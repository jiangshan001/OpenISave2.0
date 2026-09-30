import { Button, Card, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { importsApi } from '@/api/imports';
import { useImportHistory } from '@/hooks/useImports';
import type { ImportBatch } from '@/types/imports';
import { formatDate } from '@/utils/dates';

function TransactionIds({ batchId }: { batchId: number }) {
  const [ids, setIds] = useState<number[] | null>(null);
  if (ids === null) {
    return (
      <Button size="small" type="link" onClick={() => void importsApi.batchTransactions(batchId).then(setIds)}>
        Show transaction IDs
      </Button>
    );
  }
  return <span className="oi-row-meta">{ids.length ? ids.map((id) => `#${id}`).join(', ') : 'None'}</span>;
}

const columns: ColumnsType<ImportBatch> = [
  { title: 'Imported', dataIndex: 'created_at', width: 120, render: (v: string) => formatDate(v) },
  {
    title: 'Statement',
    render: (_, batch) => (
      <div className="oi-import-merchant">
        <span>{batch.source === 'wechat' ? 'WeChat Pay' : batch.source}</span>
        <span className="oi-row-meta">
          {batch.period_start ? `${formatDate(batch.period_start)} – ${formatDate(batch.period_end)}` : ''}
        </span>
      </div>
    ),
  },
  { title: 'Detected', dataIndex: 'detected_count', align: 'right', width: 90 },
  { title: 'Imported', dataIndex: 'imported_count', align: 'right', width: 90 },
  { title: 'Duplicates', dataIndex: 'duplicate_count', align: 'right', width: 100 },
  { title: 'Skipped', dataIndex: 'skipped_count', align: 'right', width: 80 },
  { title: 'Ignored', dataIndex: 'ignored_count', align: 'right', width: 80 },
];

export function ImportHistory() {
  const { data, isLoading } = useImportHistory();
  if (!isLoading && (data ?? []).length === 0) return null;
  return (
    <Card title="Import history" variant="borderless" className="oi-section-gap" styles={{ body: { padding: 0 } }}>
      <Table<ImportBatch>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        columns={columns}
        pagination={false}
        expandable={{ expandedRowRender: (batch) => <TransactionIds batchId={batch.id} /> }}
      />
    </Card>
  );
}
