import { Button, Card, Col, Popconfirm, Progress, Row, Space, Tag } from 'antd';

import { useDeleteLiability } from '@/hooks/useAssets';
import type { Liability } from '@/types/asset';
import { formatMoney, formatPercent } from '@/utils/money';

export function LiabilityProgressCard({ debt, onEdit, onRepay, onReceipt, onHistory }: {
  debt: Liability;
  onEdit: (debt: Liability) => void;
  onRepay: (debt: Liability) => void;
  onReceipt: (debt: Liability) => void;
  onHistory: (debt: Liability) => void;
}) {
  const remove = useDeleteLiability();
  return <Card size="small" className="oi-section-gap" aria-label={`Debt ${debt.name}`}>
    <div className="oi-card-title-row">
      <div><strong>{debt.name}</strong><div className="oi-meta">
        {debt.lender ? `${debt.lender} · ` : ''}{debt.account_name}
      </div></div>
      <Tag bordered={false}>{debt.currency}</Tag>
    </div>
    <Row gutter={[16, 12]} className="oi-mt-12">
      <Col xs={24} sm={8}><div className="oi-meta">Original amount</div>
        <strong>{formatMoney(debt.original_amount_minor, debt.currency)}</strong></Col>
      <Col xs={24} sm={8}><div className="oi-meta">Outstanding</div>
        <strong className="oi-negative">{formatMoney(debt.outstanding_minor, debt.currency)}</strong></Col>
      <Col xs={24} sm={8}><div className="oi-meta">Repaid</div>
        <strong>{formatMoney(debt.repaid_minor, debt.currency)} ({formatPercent(debt.repaid_percent)})</strong></Col>
    </Row>
    <Progress percent={Math.min(debt.repaid_percent ?? 0, 100)} showInfo={false} size="small"
      aria-label={`${debt.name} repayment progress`} />
    {debt.receipt_status === 'recorded' ? <div className="oi-meta">Historical deposit correction recorded.</div> : null}
    {debt.receipt_status === 'unavailable' ? <div className="oi-meta">
      Historical deposit correction is unavailable when there is no opening debt or the debt account
      already has an outgoing transfer.
    </div> : null}
    <Space wrap size={4} className="oi-mt-12">
      <Button type="primary" size="small" disabled={debt.outstanding_minor <= 0} onClick={() => onRepay(debt)}>Repay</Button>
      <Button size="small" onClick={() => onHistory(debt)}>History</Button>
      {debt.receipt_status === 'available' ? <Button size="small" onClick={() => onReceipt(debt)}>
        Record deposit</Button> : null}
      <Button size="small" onClick={() => onEdit(debt)}>Edit</Button>
      <Popconfirm title="Remove this liability?"
        description="The debt account and its balance history remain."
        okText="Remove" onConfirm={() => remove.mutate(debt.id)}>
        <Button size="small" danger>Remove</Button>
      </Popconfirm>
    </Space>
  </Card>;
}
