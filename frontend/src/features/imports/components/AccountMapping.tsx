import { Card, Select, Tag } from 'antd';

import type { Account } from '@/types';
import type { ImportLabel } from '@/types/imports';

interface AccountMappingProps {
  labels: ImportLabel[];
  accounts: Account[];
  currency: string;
  onChange: (label: string, accountId: number | null) => void;
}

/**
 * Step 2. Each WeChat funding source (零钱, a bank card…) maps to one of the
 * user's accounts. Mappings are remembered on import, never hard-coded.
 */
export function AccountMapping({ labels, accounts, currency, onChange }: AccountMappingProps) {
  const usable = accounts.filter((a) => !a.is_archived && a.is_active);
  const options = usable.map((account) => ({
    value: account.id,
    label: `${account.name} · ${account.currency}`,
    disabled: account.currency !== currency,
  }));
  const unmapped = labels.filter((item) => item.account_id === null).length;

  return (
    <Card
      variant="borderless"
      title="Payment methods → accounts"
      extra={
        unmapped ? (
          <span className="oi-chip oi-chip--warning">{unmapped} to map</span>
        ) : (
          <span className="oi-chip oi-chip--positive">All mapped</span>
        )
      }
    >
      <div className="oi-row-list">
        {labels.map((item) => (
          <div key={item.label} className="oi-row oi-mapping-row">
            <div className="oi-row-main">
              <div className="oi-row-title">“{item.label}”</div>
              <div className="oi-row-meta">
                {item.row_count} row{item.row_count === 1 ? '' : 's'}
                {item.remembered ? (
                  <Tag bordered={false} style={{ marginLeft: 8 }}>
                    Remembered
                  </Tag>
                ) : null}
              </div>
            </div>
            <span className="oi-muted" aria-hidden>
              maps to
            </span>
            <Select
              aria-label={`Account for ${item.label}`}
              style={{ width: 240 }}
              placeholder="Choose an account"
              allowClear
              showSearch
              optionFilterProp="label"
              value={item.account_id ?? undefined}
              options={options}
              onChange={(value?: number) => onChange(item.label, value ?? null)}
            />
          </div>
        ))}
      </div>
      <div className="oi-row-meta" style={{ marginTop: 8 }}>
        Only {currency} accounts can receive this statement's rows.
      </div>
    </Card>
  );
}
