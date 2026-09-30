import { Alert, DatePicker, Form, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts } from '@/hooks/useLedger';
import { useRepayLiability } from '@/hooks/useAssets';
import type { Liability } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { isLiabilityType } from '@/utils/labels';
import { formatMoney, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface FormValues {
  from_account_id: number;
  amount?: number;
  transaction_date: Dayjs;
}

interface LiabilityRepayModalProps {
  open: boolean;
  liability: Liability | null;
  onClose: () => void;
}

export function LiabilityRepayModal({ open, liability, onClose }: LiabilityRepayModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { data: accounts } = useAccounts();
  const repay = useRepayLiability(onClose);
  const currency = liability?.currency ?? 'CNY';

  const sources = useMemo(
    () =>
      (accounts ?? []).filter(
        (item) =>
          !item.is_archived &&
          item.is_active &&
          !isLiabilityType(item.account_type) &&
          item.currency === currency,
      ),
    [accounts, currency],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ transaction_date: dayjs() });
  }, [open, form]);

  const handleSubmit = async () => {
    if (!liability) return;
    const values = await validateOrNull(form);
    if (!values) return;
    repay.mutate({
      id: liability.id,
      payload: {
        from_account_id: values.from_account_id,
        amount_minor: toMinor(values.amount ?? 0, currency),
        transaction_date: toApiDate(values.transaction_date),
      },
    });
  };

  return (
    <Modal
      open={open}
      title={liability ? `Repay ${liability.name}` : 'Record repayment'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Record repayment"
      confirmLoading={repay.isPending}
      width={520}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        className="oi-form-alert"
        message={
          liability
            ? `Outstanding: ${formatMoney(liability.outstanding_minor, liability.currency)}. ` +
              'A repayment moves money from your account to the debt, so your net worth is unchanged.'
            : ''
        }
      />
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="from_account_id"
          label={`Paid from (${currency})`}
          rules={[{ required: true, message: 'Choose an account' }]}
        >
          <Select
            placeholder="Select an account"
            options={sources.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.currency}`,
            }))}
            notFoundContent={`No ${currency} account available`}
          />
        </Form.Item>
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
        <Form.Item name="transaction_date" label="Date" rules={[{ required: true }]}>
          <DatePicker className="oi-full" format="DD MMM YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
