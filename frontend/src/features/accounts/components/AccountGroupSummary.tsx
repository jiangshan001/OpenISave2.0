import { Skeleton } from 'antd';

import { StatCard, StatStrip } from '@/components/common/StatCard';
import { useDashboard } from '@/hooks/useResources';
import type { AccountBalance, AccountGroup } from '@/types';
import { ACCOUNT_GROUP_LABELS } from '@/utils/labels';

const GROUP_ORDER: AccountGroup[] = [
  'cash',
  'savings',
  'investments',
  'other_assets',
  'liabilities',
];

/**
 * Group subtotals come from the backend's net worth calculation rather than
 * being re-summed here, so this page can never disagree with the dashboard
 * about which accounts count (architecture 37, invariant 8).
 */
export function AccountGroupSummary({ accounts }: { accounts: AccountBalance[] }) {
  const { data, isLoading } = useDashboard();

  if (isLoading) return <Skeleton active paragraph={{ rows: 1 }} />;
  if (!data) return null;

  const counts = new Map<AccountGroup, number>();
  accounts.forEach((account) => {
    if (account.is_archived || !account.include_in_net_worth) return;
    counts.set(account.group, (counts.get(account.group) ?? 0) + 1);
  });

  const visible = GROUP_ORDER.filter((group) => (counts.get(group) ?? 0) > 0);
  if (visible.length === 0) return null;

  return (
    <div className="oi-stack-gap">
      <StatStrip columns={visible.length}>
        {visible.map((group) => {
          const amount = data.groups[group] ?? 0;
          const count = counts.get(group) ?? 0;
          const isLiability = group === 'liabilities';
          return (
            <StatCard
              key={group}
              label={ACCOUNT_GROUP_LABELS[group]}
              amountMinor={isLiability ? -amount : amount}
              currency={data.base_currency}
              tone={isLiability && amount ? 'negative' : 'neutral'}
              footer={`${count} account${count === 1 ? '' : 's'}`}
            />
          );
        })}
      </StatStrip>
    </div>
  );
}
