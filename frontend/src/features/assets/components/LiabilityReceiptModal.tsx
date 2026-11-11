import { Alert, Checkbox, DatePicker, Form, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useRecordLiabilityReceipt } from '@/hooks/useAssets';
import { useAccounts } from '@/hooks/useLedger';
import type { Liability } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { validateOrNull } from '@/utils/forms';
import { isLiabilityType } from '@/utils/labels';
import { toMajor, toMinor } from '@/utils/money';

type Values = { account_id: number; amount: number; transaction_date: Dayjs; confirmed: boolean };

export function LiabilityReceiptModal({ liability, onClose }: {
  liability: Liability | null; onClose: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const { data: accounts } = useAccounts();
  const save = useRecordLiabilityReceipt(onClose);
  const currency = liability?.currency ?? 'CNY';
  useEffect(() => {
    if (!liability) return;
    form.resetFields();
    form.setFieldsValue({ amount: toMajor(liability.original_amount_minor, currency),
      transaction_date: liability.start_date ? dayjs(liability.start_date) : dayjs(), confirmed: false });
  }, [liability, currency, form]);

  const submit = async () => {
    const values = await validateOrNull(form);
    if (!values || !liability) return;
    save.mutate({ id: liability.id, account_id: values.account_id,
      amount_minor: toMinor(values.amount, currency), transaction_date: toApiDate(values.transaction_date) });
  };

  return <Modal open={Boolean(liability)} title="Record an earlier loan deposit" onCancel={onClose}
    onOk={submit} okText="Record deposit" confirmLoading={save.isPending} destroyOnHidden>
    <Alert type="warning" showIcon className="oi-form-alert"
      message="This adds money to the receiving account and leaves the existing debt unchanged."
      description="Use this only for an amount missing from your account balance. Recording it twice would inflate your balance and net worth." />
    <Form form={form} layout="vertical">
      <Form.Item name="account_id" label={`Received into (${currency})`} rules={[{ required: true }]}>
        <Select placeholder="Choose an account" options={(accounts ?? [])
          .filter((item) => item.is_active && !item.is_archived &&
            !isLiabilityType(item.account_type) && item.currency === currency)
          .map((item) => ({ value: item.id, label: item.name }))} />
      </Form.Item>
      <Form.Item name="amount" label="Amount to add" rules={[{ required: true }, {
        validator: (_, value) => value > 0 && liability && toMinor(value, currency) <= liability.original_amount_minor
          ? Promise.resolve() : Promise.reject(new Error('Enter a positive amount no greater than the original loan.')),
      }]}><MoneyInput currency={currency} /></Form.Item>
      <Form.Item name="transaction_date" label="Date received" rules={[{ required: true }]}>
        <DatePicker className="oi-full" format="DD MMM YYYY" />
      </Form.Item>
      <Form.Item name="confirmed" valuePropName="checked" rules={[{
        validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Confirm before recording.')),
      }]}><Checkbox>This amount is not already included in the selected account.</Checkbox></Form.Item>
    </Form>
  </Modal>;
}
