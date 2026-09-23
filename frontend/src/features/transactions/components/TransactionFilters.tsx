import { Button, Card, DatePicker, Input, Select, Space } from 'antd';
import type { Dayjs } from 'dayjs';

import type { Account, Category, CurrencyCode, TransactionType } from '@/types';
import { toApiDate } from '@/utils/dates';
import { CURRENCY_CODES } from '@/utils/money';
import { buildCategoryOptions } from '../categoryOptions';

const { RangePicker } = DatePicker;

export interface FilterState {
  account_id?: number;
  type?: TransactionType;
  category_id?: number;
  currency?: CurrencyCode;
  date_from?: string;
  date_to?: string;
  search?: string;
}

interface TransactionFiltersProps {
  value: FilterState;
  accounts: Account[];
  categories: Category[];
  onChange: (next: FilterState) => void;
}

export function TransactionFilters({
  value,
  accounts,
  categories,
  onChange,
}: TransactionFiltersProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const hasFilters = Object.values(value).some((entry) => entry !== undefined && entry !== '');

  return (
    <Card variant="borderless" style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
      <Space wrap size={12}>
        <Input.Search
          allowClear
          placeholder="Search description"
          style={{ width: 220 }}
          defaultValue={value.search}
          onSearch={(text) => set({ search: text || undefined })}
        />
        <Select
          allowClear
          placeholder="Account"
          style={{ width: 190 }}
          value={value.account_id}
          onChange={(next) => set({ account_id: next })}
          options={accounts.map((account) => ({
            value: account.id,
            label: `${account.name} · ${account.currency}`,
          }))}
        />
        <Select
          allowClear
          placeholder="Type"
          style={{ width: 130 }}
          value={value.type}
          onChange={(next) => set({ type: next })}
          options={[
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Category"
          style={{ width: 200 }}
          value={value.category_id}
          onChange={(next) => set({ category_id: next })}
          options={buildCategoryOptions(categories)}
        />
        <Select
          allowClear
          placeholder="Currency"
          style={{ width: 120 }}
          value={value.currency}
          onChange={(next) => set({ currency: next })}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
        />
        <RangePicker
          format="DD MMM YYYY"
          onChange={(range) => {
            const [from, to] = (range ?? []) as (Dayjs | null)[];
            set({
              date_from: from ? toApiDate(from) : undefined,
              date_to: to ? toApiDate(to) : undefined,
            });
          }}
        />
        {hasFilters ? <Button onClick={() => onChange({})}>Clear</Button> : null}
      </Space>
    </Card>
  );
}
