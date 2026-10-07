import { EditOutlined, InboxOutlined, RightOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';

import { AccountMonogram } from '@/components/common/AccountMonogram';
import { MoneyText } from '@/components/common/MoneyText';
import { useArchiveAccount } from '@/hooks/useLedger';
import { resolveAccountTheme } from '@/theme/accountTheme';
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
  const theme = resolveAccountTheme(account);

  return (
    <Card
      className="oi-account-card oi-acct"
      variant="borderless"
      data-acct={theme.id}
      data-motif={theme.motif}
    >
      <div className="oi-card-title-row">
        <div className="oi-acct-head">
          <AccountMonogram theme={theme} />
          <div className="oi-acct-head-text">
            <Space size={6} wrap>
              <span className="oi-account-name">{account.name}</span>
              {account.is_archived ? <Tag bordered={false}>Archived</Tag> : null}
              {!account.include_in_net_worth ? (
                <Tooltip title="Excluded from net worth">
                  <Tag color="orange" bordered={false}>
                    Off net worth
                  </Tag>
                </Tooltip>
              ) : null}
            </Space>
            <div className="oi-account-institution">
              {account.institution ?? ACCOUNT_TYPE_LABELS[account.account_type]}
            </div>
          </div>
        </div>
        <span className={`oi-chip oi-chip--quiet${account.is_liability ? ' oi-negative' : ''}`}>
          {account.currency}
        </span>
      </div>

      <div className="oi-account-balance">
        <MoneyText
          amountMinor={account.balance_minor}
          currency={account.currency}
          baseAmountMinor={account.base_balance_minor}
          baseCurrency={account.base_currency}
          size="xl"
          tone={account.is_liability ? 'negative' : 'neutral'}
        />
      </div>

      <div className="oi-acct-tags">
        <span className="oi-chip">{ACCOUNT_TYPE_LABELS[account.account_type]}</span>
        {purposeLabel ? <span className="oi-chip">{purposeLabel}</span> : null}
      </div>

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
