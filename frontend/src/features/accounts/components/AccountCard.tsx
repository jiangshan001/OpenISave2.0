import { EditOutlined, InboxOutlined, RightOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';

import { MoneyText } from '@/components/common/MoneyText';
import { useArchiveAccount } from '@/hooks/useLedger';
import type { AccountBalance } from '@/types';
import { ACCOUNT_TYPE_LABELS } from '@/utils/labels';

interface AccountCardProps {
  account: AccountBalance;
  purposeLabel?: string;
  onEdit: (account: AccountBalance) => void;
}

export function AccountCard({ account, purposeLabel, onEdit }: AccountCardProps) {
  const navigate = useNavigate();
  const archive = useArchiveAccount();

  return (
    <Card className="oi-account-card" variant="borderless">
      <div className="oi-card-title-row">
        <div>
          <Space size={6} wrap>
            <span className="oi-strong">{account.name}</span>
            {account.is_archived ? <Tag>Archived</Tag> : null}
            {!account.include_in_net_worth ? (
              <Tooltip title="Excluded from net worth">
                <Tag color="orange">Off net worth</Tag>
              </Tooltip>
            ) : null}
          </Space>
          <div className="oi-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {account.institution ?? ACCOUNT_TYPE_LABELS[account.account_type]}
          </div>
        </div>
        <span className={`oi-chip${account.is_liability ? ' oi-chip--negative' : ''}`}>{account.currency}</span>
      </div>

      <div style={{ margin: '18px 0 12px' }}>
        <MoneyText
          amountMinor={account.balance_minor}
          currency={account.currency}
          baseAmountMinor={account.base_balance_minor}
          baseCurrency={account.base_currency}
          size="xl"
          tone={account.is_liability ? 'negative' : 'neutral'}
        />
      </div>

      <Space size={6} wrap>
        <Tag bordered={false}>{ACCOUNT_TYPE_LABELS[account.account_type]}</Tag>
        {purposeLabel ? (
          <Tag bordered={false} color="blue">
            {purposeLabel}
          </Tag>
        ) : null}
      </Space>

      <Space size={2} wrap className="oi-account-actions">
        <Button
          size="small"
          type="text"
          icon={<RightOutlined />}
          onClick={() => navigate(`/accounts/${account.id}`)}
        >
          Details
        </Button>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(account)}>
          Edit
        </Button>
        <Button
          size="small"
          type="text"
          loading={archive.isPending}
          icon={account.is_archived ? <UndoOutlined /> : <InboxOutlined />}
          onClick={() => archive.mutate({ id: account.id, archived: !account.is_archived })}
        >
          {account.is_archived ? 'Restore' : 'Archive'}
        </Button>
      </Space>
    </Card>
  );
}
