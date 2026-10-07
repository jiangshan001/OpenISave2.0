import { Tag, Tooltip } from 'antd';

import { AccountMonogram } from '@/components/common/AccountMonogram';
import { resolveAccountTheme, type AccountTheme } from '@/theme/accountTheme';
import type { CurrencyCode, GoalContribution } from '@/types';
import { formatMoney, formatPercent } from '@/utils/money';

interface GoalContributionsProps {
  contributions: GoalContribution[];
  goalCurrency: CurrencyCode;
  total: number | null;
  accountThemes?: Map<number, AccountTheme>;
}

/**
 * Which accounts hold the goal's money: one split bar (each account in its
 * own identity colour) and a row per account with its share. The amounts are
 * the backend's converted figures; the share is only their ratio.
 */
export function GoalContributions({
  contributions,
  goalCurrency,
  total,
  accountThemes,
}: GoalContributionsProps) {
  if (contributions.length === 0) {
    return <div className="oi-contrib oi-muted oi-small">No accounts linked</div>;
  }

  const themeFor = (row: GoalContribution) =>
    accountThemes?.get(row.account_id) ??
    resolveAccountTheme({ name: row.account_name, institution: null, account_type: 'other_asset' });
  const share = (row: GoalContribution) =>
    total && total > 0 && row.converted_minor !== null && row.converted_minor > 0
      ? (row.converted_minor / total) * 100
      : null;
  const counted = contributions.filter((row) => share(row) !== null);
  const summary = counted.map((row) => `${row.account_name} ${formatPercent(share(row))}`).join(', ');

  return (
    <div className="oi-contrib">
      {counted.length > 0 ? (
        <div className="oi-contrib-bar" role="img" aria-label={`Contribution split: ${summary}`}>
          {counted.map((row) => (
            <span
              key={row.account_id}
              data-acct={themeFor(row).id}
              style={{ flexGrow: row.converted_minor ?? 0 }}
            />
          ))}
        </div>
      ) : null}
      <ul className="oi-contrib-list">
        {contributions.map((row) => (
          <li key={row.account_id} className="oi-contrib-row">
            <AccountMonogram theme={themeFor(row)} size="sm" />
            <div>
              <div className="oi-contrib-name">
                {row.account_name}
                {row.shared_with_goals > 1 ? (
                  <Tooltip
                    title={`Also used by ${row.shared_with_goals - 1} other goal(s). This is a label, not extra money.`}
                  >
                    <Tag color="blue" bordered={false}>
                      shared
                    </Tag>
                  </Tooltip>
                ) : null}
                {!row.is_eligible ? (
                  <Tooltip title="This account is archived or excluded from net worth.">
                    <Tag color="orange" bordered={false}>
                      check
                    </Tag>
                  </Tooltip>
                ) : null}
              </div>
              {row.currency !== goalCurrency ? (
                <div className="oi-contrib-native">{formatMoney(row.balance_minor, row.currency)}</div>
              ) : null}
            </div>
            <div className="oi-contrib-figure">
              {row.converted_minor === null ? (
                <Tooltip title="No exchange rate available, so this account is left out of the total.">
                  <span className="oi-warning">no rate</span>
                </Tooltip>
              ) : (
                formatMoney(row.converted_minor, goalCurrency)
              )}
              <span className="oi-contrib-share">{formatPercent(share(row))}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
