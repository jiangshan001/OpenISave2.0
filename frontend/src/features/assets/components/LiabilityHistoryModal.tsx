import { Modal, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { liabilitiesApi } from '@/api/assets';
import { useAccounts } from '@/hooks/useLedger';
import type { Liability } from '@/types/asset';
import type { Transaction } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatMoney } from '@/utils/money';

export function LiabilityHistoryModal({ liability, onClose }: {
  liability: Liability | null; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [liability?.id]);
  const history = useQuery({ queryKey: ['liabilities', 'repayments', liability?.id, page],
    queryFn: () => liabilitiesApi.repaymentHistory(liability!.id, (page - 1) * 25),
    enabled: Boolean(liability) });
  const { data: accounts } = useAccounts(true);
  return <Modal open={Boolean(liability)} title={liability ? `${liability.name} · repayment history` : 'History'}
    onCancel={onClose} footer={null} width={700} destroyOnHidden>
    <p className="oi-muted">Transfers into this debt account are shown as repayments. Previously repaid
      amounts entered as an opening balance may not have individual transactions.</p>
    {history.error ? <p>Could not load repayment history. Please close and retry.</p> : null}
    <Table<Transaction> rowKey="id" dataSource={history.data?.items ?? []} loading={history.isLoading}
      pagination={{ current: page, pageSize: 25, total: history.data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      locale={{ emptyText: 'No repayment transfers recorded' }} columns={[
        { title: 'Date', render: (_, row) => formatDate(row.transaction_date) },
        { title: 'Paid from', render: (_, row) => accounts?.find((a) => a.id === row.from_account_id)?.name ?? '—' },
        { title: 'Amount received by debt', align: 'right', render: (_, row) =>
          formatMoney(row.dest_amount_minor ?? row.amount_minor, row.dest_currency ?? row.currency) },
      ]} />
  </Modal>;
}
