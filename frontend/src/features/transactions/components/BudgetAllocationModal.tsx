import { DatePicker, Form, InputNumber, Modal } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';

import { useSaveBudgetAllocation } from '@/hooks/useLedger';
import type { Transaction } from '@/types';
import { formatMoney } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

type Values = { months: number; start_month?: Dayjs | null };

export function BudgetAllocationModal({ transaction, onClose }: {
  transaction: Transaction | null; onClose: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const save = useSaveBudgetAllocation(onClose);
  useEffect(() => {
    if (!transaction) return;
    form.resetFields();
    form.setFieldsValue({
      months: transaction.budget_months ?? 1,
      start_month: transaction.budget_start_month ? dayjs(transaction.budget_start_month) : null,
    });
  }, [form, transaction]);

  const submit = async () => {
    const values = await validateOrNull(form);
    if (!values || !transaction) return;
    save.mutate({ id: transaction.id, months: values.months,
      start_month: values.start_month ? values.start_month.startOf('month').format('YYYY-MM-DD') : null });
  };

  return <Modal open={Boolean(transaction)} title="Budget allocation" onCancel={onClose}
    onOk={submit} confirmLoading={save.isPending} okText="Save allocation" destroyOnHidden>
    <p className="oi-muted">{transaction ? `${transaction.description || 'Expense'} · ${formatMoney(transaction.amount_minor, transaction.currency)}.` : ''}
      {' '}Only budget spending is spread. The payment, account balance and cash-flow reports stay unchanged.</p>
    <Form form={form} layout="vertical">
      <Form.Item name="months" label="Number of months" rules={[{ required: true }]}>
        <InputNumber min={1} max={36} precision={0} className="oi-full" />
      </Form.Item>
      <Form.Item name="start_month" label="First budget month"
        extra="Leave empty to begin in the payment month. For quarterly rent, choose 3 months.">
        <DatePicker picker="month" format="MMM YYYY" className="oi-full" />
      </Form.Item>
    </Form>
  </Modal>;
}
