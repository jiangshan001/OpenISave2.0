import { Alert, Checkbox, Empty, Radio, Space, Tag } from 'antd';

import type { AccountBalance, GoalSelectionMode } from '@/types';
import { isLiabilityType } from '@/utils/labels';
import { formatMoney } from '@/utils/money';

interface GoalAccountPickerProps {
  accounts: AccountBalance[];
  mode: GoalSelectionMode;
  selected: number[];
  onModeChange: (mode: GoalSelectionMode) => void;
  onSelectedChange: (ids: number[]) => void;
}

/** An account counts towards goals only if it holds assets you could spend. */
export function isEligible(account: AccountBalance): boolean {
  if (account.is_archived || !account.is_active) return false;
  if (!account.include_in_net_worth) return false;
  return !isLiabilityType(account.account_type);
}

export function GoalAccountPicker({
  accounts,
  mode,
  selected,
  onModeChange,
  onSelectedChange,
}: GoalAccountPickerProps) {
  const eligible = accounts.filter(isEligible);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Radio.Group
        value={mode}
        onChange={(event) => onModeChange(event.target.value)}
        options={[
          { value: 'selected', label: 'Choose accounts' },
          { value: 'all_eligible', label: 'All eligible accounts' },
        ]}
        optionType="button"
        buttonStyle="solid"
      />

      {mode === 'all_eligible' ? (
        <Alert
          type="info"
          showIcon
          message={`This goal follows all ${eligible.length} eligible account${
            eligible.length === 1 ? '' : 's'
          } automatically.`}
          description="Eligible means active, counted in net worth, and not a credit card, loan or other debt. New accounts join the goal on their own."
        />
      ) : eligible.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">No eligible accounts yet</span>}
        />
      ) : (
        <Checkbox.Group
          value={selected}
          onChange={(values) => onSelectedChange(values as number[])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {eligible.map((account) => (
              <Checkbox key={account.id} value={account.id} style={{ width: '100%' }}>
                <Space size={8} wrap>
                  <span className="oi-strong">{account.name}</span>
                  <Tag bordered={false}>{account.currency}</Tag>
                  <span className="oi-muted">
                    {formatMoney(account.balance_minor, account.currency)}
                  </span>
                </Space>
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      )}
    </Space>
  );
}
