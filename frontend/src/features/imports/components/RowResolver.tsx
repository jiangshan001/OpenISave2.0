import { Button, Checkbox, Input, Radio, Select, Space } from 'antd';
import { useState } from 'react';

import type { Account, Category } from '@/types';
import type { ImportRow, RowOverride, RuleMatchField, RuleMatchType } from '@/types/imports';
import { buildCategoryOptions } from '../../transactions/categoryOptions';

type Choice = 'category' | 'transfer' | 'skip' | 'ignore';
type RuleShape = 'merchant-exact' | 'merchant-contains' | 'text-contains';

const SHAPES: Record<RuleShape, { field: RuleMatchField; type: RuleMatchType; label: string }> = {
  'merchant-exact': { field: 'merchant', type: 'exact', label: 'Merchant is exactly' },
  'merchant-contains': { field: 'merchant', type: 'contains', label: 'Merchant contains' },
  'text-contains': { field: 'any_text', type: 'contains', label: 'Description contains' },
};

interface RowResolverProps {
  row: ImportRow;
  current?: RowOverride;
  categories: Category[];
  accounts: Account[];
  onApply: (override: Omit<RowOverride, 'row_id'> | null) => void;
}

/** How the user settles one row. The backend validates and re-plans. */
export function RowResolver({ row, current, categories, accounts, onApply }: RowResolverProps) {
  const directional = row.direction === 'income' || row.direction === 'expense';
  const [choice, setChoice] = useState<Choice>(() => {
    if (current?.ignore) return 'ignore';
    if (current?.skip) return 'skip';
    return current?.counter_account_id || !directional ? 'transfer' : 'category';
  });
  const [categoryId, setCategoryId] = useState(current?.category_id ?? undefined);
  const [counterId, setCounterId] = useState(current?.counter_account_id ?? undefined);
  const [remember, setRemember] = useState(Boolean(current?.remember));
  const [shape, setShape] = useState<RuleShape>('merchant-exact');
  const [pattern, setPattern] = useState(current?.remember?.pattern ?? row.counterparty);

  const kindCategories = categories.filter(
    (category) => category.kind === row.direction && category.is_active,
  );
  const accountOptions = accounts
    .filter((a) => !a.is_archived && a.id !== row.account_id && a.currency === row.currency)
    .map((a) => ({ value: a.id, label: a.name }));

  const apply = () => {
    if (choice === 'skip') return onApply({ skip: true });
    if (choice === 'ignore') return onApply({ ignore: true });
    if (choice === 'transfer') return onApply({ counter_account_id: counterId ?? null });
    const rule = SHAPES[shape];
    onApply({
      category_id: categoryId ?? null,
      remember: remember ? { match_field: rule.field, match_type: rule.type, pattern } : null,
    });
  };
  const ready =
    choice === 'skip' ||
    choice === 'ignore' ||
    (choice === 'transfer' && counterId !== undefined) ||
    (choice === 'category' && categoryId !== undefined && (!remember || pattern.trim()));

  return (
    <div className="oi-resolver">
      <Radio.Group
        className="oi-resolver-choices"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        options={[
          { value: 'category', label: 'Choose a category', disabled: !directional },
          { value: 'transfer', label: 'Transfer between my accounts' },
          { value: 'skip', label: 'Skip this import' },
          { value: 'ignore', label: 'Ignore permanently' },
        ]}
      />
      {choice === 'category' ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Select
            showSearch
            style={{ width: '100%' }}
            optionFilterProp="label"
            placeholder={`Choose an ${row.direction} category`}
            value={categoryId}
            onChange={setCategoryId}
            options={buildCategoryOptions(kindCategories)}
          />
          <Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)}>
            Remember this rule for future imports
          </Checkbox>
          {remember ? (
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={shape}
                onChange={setShape}
                style={{ width: 190 }}
                options={Object.entries(SHAPES).map(([value, s]) => ({ value, label: s.label }))}
              />
              <Input value={pattern} onChange={(event) => setPattern(event.target.value)} />
            </Space.Compact>
          ) : null}
        </Space>
      ) : null}
      {choice === 'transfer' ? (
        <Select
          placeholder={row.direction === 'income' ? 'Money came from…' : 'Money went to…'}
          value={counterId}
          onChange={setCounterId}
          options={accountOptions}
        />
      ) : null}
      {choice === 'skip' ? (
        <div className="oi-row-meta">Not imported now. It shows up again in later imports.</div>
      ) : null}
      {choice === 'ignore' ? (
        <div className="oi-row-meta">
          Never imported. Whenever WeChat transaction {row.external_id} appears again it is
          marked Ignored. You can restore it from Import history → Ignored items.
        </div>
      ) : null}
      <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
        {current ? (
          <Button size="small" onClick={() => onApply(null)}>
            Undo
          </Button>
        ) : null}
        <Button size="small" type="primary" disabled={!ready} onClick={apply}>
          Apply
        </Button>
      </Space>
    </div>
  );
}
