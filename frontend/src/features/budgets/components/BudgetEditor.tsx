import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Modal, Select, Space, Table } from 'antd';
import { useEffect, useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useSaveBudget } from '@/hooks/useResources';
import type { BudgetPeriod, Category } from '@/types';
import { monthLabel } from '@/utils/dates';
import { toMajor, toMinor } from '@/utils/money';
import { buildCategoryOptions } from '../../transactions/categoryOptions';

interface EditorRow {
  category_id: number;
  amount: number;
}

interface BudgetEditorProps {
  open: boolean;
  period: BudgetPeriod;
  categories: Category[];
  onClose: () => void;
}

export function BudgetEditor({ open, period, categories, onClose }: BudgetEditorProps) {
  const [rows, setRows] = useState<EditorRow[]>([]);
  const save = useSaveBudget(period.year, period.month, onClose);

  useEffect(() => {
    if (!open) return;
    setRows(
      period.lines.map((line) => ({
        category_id: line.category_id,
        amount: toMajor(line.budget_minor, period.currency),
      })),
    );
  }, [open, period]);

  const used = new Set(rows.map((row) => row.category_id));
  const options = buildCategoryOptions(categories).filter((option) => !used.has(option.value));

  const addRow = () => {
    const next = options[0];
    if (next) setRows([...rows, { category_id: next.value, amount: 0 }]);
  };

  const updateRow = (index: number, patch: Partial<EditorRow>) =>
    setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  const handleSave = () =>
    save.mutate(
      rows
        .filter((row) => row.amount > 0)
        .map((row) => ({
          category_id: row.category_id,
          amount_minor: toMinor(row.amount, period.currency),
        })),
    );

  return (
    <Modal
      open={open}
      title={`Budget for ${monthLabel(period.year, period.month)}`}
      onCancel={onClose}
      onOk={handleSave}
      okText="Save budget"
      confirmLoading={save.isPending}
      width={620}
      destroyOnHidden
    >
      <p className="oi-muted">
        Set a monthly limit per category in {period.currency}. Actual spending is taken from your
        transactions automatically — a budget on a parent category includes its subcategories.
      </p>
      <Table<EditorRow>
        rowKey={(row) => String(row.category_id)}
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <span className="oi-muted">No categories budgeted yet</span> }}
        columns={[
          {
            title: 'Category',
            render: (_, row, index) => (
              <Select
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                value={row.category_id}
                onChange={(value) => updateRow(index, { category_id: value })}
                options={buildCategoryOptions(categories).filter(
                  (option) => option.value === row.category_id || !used.has(option.value),
                )}
              />
            ),
          },
          {
            title: 'Monthly budget',
            width: 190,
            render: (_, row, index) => (
              <MoneyInput
                currency={period.currency}
                value={row.amount}
                onChange={(value) => updateRow(index, { amount: value ?? 0 })}
              />
            ),
          },
          {
            title: '',
            width: 48,
            render: (_, _row, index) => (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setRows(rows.filter((__, position) => position !== index))}
              />
            ),
          },
        ]}
      />
      <Space style={{ marginTop: 12 }}>
        <Button icon={<PlusOutlined />} onClick={addRow} disabled={options.length === 0}>
          Add category
        </Button>
      </Space>
    </Modal>
  );
}
