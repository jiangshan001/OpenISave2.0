import { Col, Form, Input, Modal, Radio, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts } from '@/hooks/useLedger';
import { useCategories } from '@/hooks/useResources';
import { useSaveRecurring } from '@/hooks/useRecurring';
import type { CurrencyCode } from '@/types';
import type {
  RecurringFrequency,
  RecurringMode,
  RecurringRule,
  RecurringType,
} from '@/types/recurring';
import { toApiDate } from '@/utils/dates';
import { validateOrNull } from '@/utils/forms';
import { toMajor, toMinor } from '@/utils/money';
import { buildCategoryOptions } from '../../transactions/categoryOptions';
import { ScheduleFields } from './ScheduleFields';

interface FormValues {
  name: string;
  transaction_type: RecurringType;
  account_id: number;
  destination_account_id?: number;
  category_id?: number;
  amount: number;
  dest_amount?: number;
  frequency: RecurringFrequency;
  interval: number;
  day_of_month?: number;
  start_date: Dayjs;
  end_date?: Dayjs | null;
  mode: RecurringMode;
  note?: string;
}

interface RecurringFormModalProps {
  open: boolean;
  rule?: RecurringRule | null;
  onClose: () => void;
}

const positive = {
  validator: (_: unknown, value: number) =>
    value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
};

export function RecurringFormModal({ open, rule, onClose }: RecurringFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const type = Form.useWatch('transaction_type', form) ?? 'expense';
  const frequency = Form.useWatch('frequency', form) ?? 'monthly';
  const accountId = Form.useWatch('account_id', form);
  const destinationId = Form.useWatch('destination_account_id', form);

  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories(type === 'income' ? 'income' : 'expense');
  const save = useSaveRecurring(onClose);

  const active = useMemo(
    () => (accounts ?? []).filter((account) => account.is_active && !account.is_archived),
    [accounts],
  );
  const currencyOf = (id?: number): CurrencyCode =>
    active.find((account) => account.id === id)?.currency ?? 'CNY';
  const currency = currencyOf(accountId);
  const destCurrency = currencyOf(destinationId);
  const crossCurrency = type === 'transfer' && destinationId !== undefined && destCurrency !== currency;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (rule) {
      form.setFieldsValue({
        name: rule.name,
        transaction_type: rule.transaction_type,
        account_id: rule.account_id,
        destination_account_id: rule.destination_account_id ?? undefined,
        category_id: rule.category_id ?? undefined,
        amount: toMajor(rule.amount_minor, rule.currency),
        dest_amount: rule.dest_amount_minor
          ? toMajor(rule.dest_amount_minor, currencyOf(rule.destination_account_id ?? undefined))
          : undefined,
        frequency: rule.frequency,
        interval: rule.interval,
        day_of_month: rule.day_of_month ?? undefined,
        start_date: dayjs(rule.start_date),
        end_date: rule.end_date ? dayjs(rule.end_date) : null,
        mode: rule.mode,
        note: rule.note ?? undefined,
      });
    } else {
      form.setFieldsValue({
        transaction_type: 'expense',
        account_id: active[0]?.id,
        frequency: 'monthly',
        interval: 1,
        start_date: dayjs(),
        day_of_month: dayjs().date(),
        mode: 'review',
      });
    }
    // Initialise only when the dialog opens or switches rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: rule?.id,
      payload: {
        name: values.name.trim(),
        transaction_type: values.transaction_type,
        account_id: values.account_id,
        destination_account_id: type === 'transfer' ? values.destination_account_id : null,
        category_id: type === 'transfer' ? null : (values.category_id ?? null),
        amount_minor: toMinor(values.amount, currency),
        dest_amount_minor:
          crossCurrency && values.dest_amount ? toMinor(values.dest_amount, destCurrency) : null,
        frequency: values.frequency,
        interval: values.interval,
        day_of_month: values.frequency === 'monthly' ? (values.day_of_month ?? null) : null,
        start_date: toApiDate(values.start_date),
        end_date: values.end_date ? toApiDate(values.end_date) : null,
        mode: values.mode,
        note: values.note?.trim() || null,
      },
    });
  };

  const accountOptions = active.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));

  return (
    <Modal
      open={open}
      title={rule ? 'Edit recurring transaction' : 'New recurring transaction'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={rule ? 'Save changes' : 'Create'}
      confirmLoading={save.isPending}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name it' }]}>
              <Input placeholder="e.g. Rent" maxLength={120} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="transaction_type" label="Type" rules={[{ required: true }]}>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={() => form.setFieldValue('category_id', undefined)}
                options={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                  { value: 'transfer', label: 'Transfer' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="account_id"
              label={type === 'transfer' ? 'From account' : 'Account'}
              rules={[{ required: true, message: 'Choose an account' }]}
            >
              <Select options={accountOptions} placeholder="Select an account" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="amount"
              label={`Amount (${currency})`}
              rules={[{ required: true, message: 'Enter an amount' }, positive]}
            >
              <MoneyInput currency={currency} />
            </Form.Item>
          </Col>
        </Row>

        {type === 'transfer' ? (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="destination_account_id"
                label="To account"
                rules={[{ required: true, message: 'Choose the destination' }]}
              >
                <Select
                  options={accountOptions.filter((option) => option.value !== accountId)}
                  placeholder="Select an account"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              {crossCurrency ? (
                <Form.Item
                  name="dest_amount"
                  label={`Amount received (${destCurrency})`}
                  rules={[{ required: true, message: 'Enter the amount received' }, positive]}
                >
                  <MoneyInput currency={destCurrency} />
                </Form.Item>
              ) : null}
            </Col>
          </Row>
        ) : (
          <Form.Item name="category_id" label="Category">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select a category"
              options={buildCategoryOptions(categories ?? [])}
            />
          </Form.Item>
        )}

        <ScheduleFields frequency={frequency} />

        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
