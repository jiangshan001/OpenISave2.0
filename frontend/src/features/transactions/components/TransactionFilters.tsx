import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Input, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

import type { Account, Category, CurrencyCode, TransactionType } from '@/types';
import { formatDate, toApiDate } from '@/utils/dates';
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

const TYPE_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
];

interface ActiveChip {
  key: string;
  label: string;
  clear: Partial<FilterState>;
}

function activeChips(
  value: FilterState,
  accounts: Account[],
  categories: Category[],
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (value.search) chips.push({ key: 'search', label: `“${value.search}”`, clear: { search: undefined } });
  if (value.account_id !== undefined) {
    const name = accounts.find((account) => account.id === value.account_id)?.name ?? 'Account';
    chips.push({ key: 'account', label: name, clear: { account_id: undefined } });
  }
  if (value.type) {
    const label = TYPE_OPTIONS.find((option) => option.value === value.type)?.label ?? value.type;
    chips.push({ key: 'type', label, clear: { type: undefined } });
  }
  if (value.category_id !== undefined) {
    const name = categories.find((category) => category.id === value.category_id)?.name ?? 'Category';
    chips.push({ key: 'category', label: name, clear: { category_id: undefined } });
  }
  if (value.currency) chips.push({ key: 'currency', label: value.currency, clear: { currency: undefined } });
  if (value.date_from || value.date_to) {
    const from = value.date_from ? formatDate(value.date_from) : 'Any date';
    const to = value.date_to ? formatDate(value.date_to) : 'today';
    chips.push({
      key: 'dates',
      label: `${from} to ${to}`,
      clear: { date_from: undefined, date_to: undefined },
    });
  }
  return chips;
}

/** Compact filter toolbar with the active filters echoed as removable chips. */
export function TransactionFilters({
  value,
  accounts,
  categories,
  onChange,
}: TransactionFiltersProps) {
  const [search, setSearch] = useState(value.search ?? '');
  useEffect(() => setSearch(value.search ?? ''), [value.search]);

  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const chips = activeChips(value, accounts, categories);
  const range: [Dayjs | null, Dayjs | null] | null =
    value.date_from || value.date_to
      ? [value.date_from ? dayjs(value.date_from) : null, value.date_to ? dayjs(value.date_to) : null]
      : null;

  return (
    <div className="oi-toolbar" role="search" aria-label="Filter transactions">
      <div className="oi-toolbar-row">
        <Input
          allowClear
          variant="filled"
          prefix={<SearchOutlined className="oi-subtle" />}
          placeholder="Search description"
          aria-label="Search description"
          className="oi-filter-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (!event.target.value && value.search) set({ search: undefined });
          }}
          onPressEnter={() => set({ search: search.trim() || undefined })}
        />
        <Select
          allowClear
          variant="filled"
          placeholder="Account"
          aria-label="Account"
          className="oi-filter-account"
          value={value.account_id}
          onChange={(next) => set({ account_id: next })}
          options={accounts.map((account) => ({
            value: account.id,
            label: `${account.name} · ${account.currency}`,
          }))}
        />
        <Select
          allowClear
          variant="filled"
          placeholder="Type"
          aria-label="Type"
          className="oi-filter-type"
          value={value.type}
          onChange={(next) => set({ type: next })}
          options={TYPE_OPTIONS}
        />
        <Select
          allowClear
          showSearch
          variant="filled"
          optionFilterProp="label"
          placeholder="Category"
          aria-label="Category"
          className="oi-filter-category"
          value={value.category_id}
          onChange={(next) => set({ category_id: next })}
          options={buildCategoryOptions(categories)}
        />
        <Select
          allowClear
          variant="filled"
          placeholder="Currency"
          aria-label="Currency"
          className="oi-filter-currency"
          value={value.currency}
          onChange={(next) => set({ currency: next })}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
        />
        <RangePicker
          variant="filled"
          format="DD MMM YYYY"
          className="oi-filter-dates"
          value={range}
          onChange={(next) => {
            const [from, to] = (next ?? []) as (Dayjs | null)[];
            set({
              date_from: from ? toApiDate(from) : undefined,
              date_to: to ? toApiDate(to) : undefined,
            });
          }}
        />
      </div>
      {chips.length > 0 ? (
        <div className="oi-filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="oi-filter-chip"
              onClick={() => set(chip.clear)}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <CloseOutlined />
            </button>
          ))}
          <Button type="text" size="small" onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
