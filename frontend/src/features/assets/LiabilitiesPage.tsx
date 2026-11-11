import { PlusOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useLiabilities } from '@/hooks/useAssets';
import type { Liability } from '@/types/asset';
import { LiabilityFormModal } from './components/LiabilityFormModal';
import { LiabilityHistoryModal } from './components/LiabilityHistoryModal';
import { LiabilityReceiptModal } from './components/LiabilityReceiptModal';
import { LiabilityRepayModal } from './components/LiabilityRepayModal';
import { LiabilityProgressCard } from './components/LiabilityProgressCard';

export function LiabilitiesPage() {
  const liabilities = useLiabilities();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [repaying, setRepaying] = useState<Liability | null>(null);
  const [receipt, setReceipt] = useState<Liability | null>(null);
  const [history, setHistory] = useState<Liability | null>(null);

  return <>
    <PageHeader title="Loans & repayments"
      subtitle="Track each debt, record repayments and review repayment history."
      actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>
        Add or track debt</Button>} />
    <Card variant="borderless">
      <p className="oi-muted">Progress compares the original amount with the current debt balance.
        Record interest separately when needed. To track an existing loan account, choose it when adding a debt.</p>
      <StateBoundary isLoading={liabilities.isLoading} error={liabilities.error}
        onRetry={() => void liabilities.refetch()}>
        {(liabilities.data ?? []).length === 0 ? <p className="oi-muted">No debts tracked yet.</p> :
          (liabilities.data ?? []).map((debt) => <LiabilityProgressCard key={debt.id} debt={debt}
            onEdit={(item) => { setEditing(item); setFormOpen(true); }} onRepay={setRepaying}
            onReceipt={setReceipt} onHistory={setHistory} />)}
      </StateBoundary>
    </Card>
    <LiabilityFormModal open={formOpen} liability={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    <LiabilityRepayModal open={Boolean(repaying)} liability={repaying} onClose={() => setRepaying(null)} />
    <LiabilityReceiptModal liability={receipt} onClose={() => setReceipt(null)} />
    <LiabilityHistoryModal liability={history} onClose={() => setHistory(null)} />
  </>;
}
