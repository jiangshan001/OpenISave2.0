import { Col, DatePicker, Form, Input, Modal, Radio, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts, useSaveTransaction, useTransactionEntryOptions } from '@/hooks/useLedger';
import { useCategories } from '@/hooks/useResources';
import type { CurrencyCode, Transaction } from '@/types';
import { toApiDate } from '@/utils/dates';
import { toMajor, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';
import { buildCategoryOptions } from '../categoryOptions';
import { buildAccountOptions } from '../accountOptions';

interface FormValues {
  type: 'expense' | 'income';
  account_id: number;
  amount: number;
  transaction_date: Dayjs;
  description: string;
  category_id?: number;
  note?: string;
}

interface TransactionFormModalProps {
  open: boolean;
  transaction?: Transaction | null;
  onClose: () => void;
}

export function TransactionFormModal({ open, transaction, onClose }: TransactionFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState<number | undefined>();

  const { data: accounts } = useAccounts();
  const entryOptions = useTransactionEntryOptions(type, open);
  const accountOptions = useMemo(
    () => buildAccountOptions(accounts ?? [], entryOptions.data),
    [accounts, entryOptions.data],
  );
  const { data: allCategories } = useCategories(type, true);
  const save = useSaveTransaction(onClose);

  // New entries may only use active categories, but an edit keeps the archived
  // category it was filed under rather than silently dropping it.
  const categories = useMemo(
    () =>
      (allCategories ?? []).filter(
        (category) => category.is_active || category.id === transaction?.category_id,
      ),
    [allCategories, transaction?.category_id],
  );

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((account) => account.is_active && !account.is_archived),
    [accounts],
  );
  const currency: CurrencyCode =
    activeAccounts.find((account) => account.id === accountId)?.currency ?? 'CNY';

  useEffect(() => {
    if (!open) return;
    if (transaction && (transaction.type === 'expense' || transaction.type === 'income')) {
      setType(transaction.type);
      setAccountId(transaction.account_id ?? undefined);
      form.setFieldsValue({
        type: transaction.type,
        account_id: transaction.account_id ?? undefined,
        amount: toMajor(transaction.amount_minor, transaction.currency),
        transaction_date: dayjs(transaction.transaction_date),
        description: transaction.description,
        category_id: transaction.category_id ?? undefined,
        note: transaction.note ?? undefined,
      });
    } else {
      setType('expense');
      setAccountId(undefined);
      form.resetFields();
      form.setFieldsValue({
        type: 'expense',
        transaction_date: dayjs(),
      });
    }
  }, [open, transaction, form]);

  useEffect(() => {
    if (!open || transaction || accountId != null || entryOptions.isPending) return;
    const preferred = accountOptions[0]?.options[0]?.value;
    if (preferred == null) return;
    setAccountId(preferred);
    form.setFieldValue('account_id', preferred);
  }, [open, transaction, accountId, entryOptions.isPending, accountOptions, form]);

  const handleTypeChange = (next: 'expense' | 'income') => {
    setType(next);
    form.setFieldValue('category_id', undefined);
    // Preserve an explicit selection or an amount already entered in its currency.
    if (!transaction && !form.isFieldTouched('account_id') && !form.getFieldValue('amount')) {
      setAccountId(undefined);
      form.setFieldValue('account_id', undefined);
    }
  };

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: transaction?.id,
      payload: {
        type: values.type,
        account_id: values.account_id,
        amount_minor: toMinor(values.amount, currency),
        transaction_date: toApiDate(values.transaction_date),
        description: values.description?.trim() ?? '',
        category_id: values.category_id ?? null,
        note: values.note?.trim() || null,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={transaction ? 'Save changes' : 'Record transaction'}
      confirmLoading={save.isPending}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            onChange={(event) => handleTypeChange(event.target.value)}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="account_id"
              label="Account"
              rules={[{ required: true, message: 'Choose an account' }]}
            >
              <Select
                onChange={(value: number) => setAccountId(value)}
                placeholder="Select an account"
                loading={entryOptions.isFetching}
                options={accountOptions}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="amount"
              label={`Amount (${currency})`}
              rules={[
                { required: true, message: 'Enter an amount' },
                {
                  validator: (_, value) =>
                    value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
                },
              ]}
            >
              <MoneyInput currency={currency} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="transaction_date"
              label="Date"
              rules={[{ required: true, message: 'Pick a date' }]}
            >
              <DatePicker className="oi-full" format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="category_id" label="Category">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select a category"
                options={buildCategoryOptions(categories)}
              />
            </Form.Item>
          </Col>
        </Row>

        <div className="oi-form-section">Details</div>
        <Form.Item name="description" label="Description">
          <Input placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Tesco'} />
        </Form.Item>

        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
