import { Alert, Form, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';

import { useSetManualRate } from '@/hooks/useResources';
import type { CurrencyCode } from '@/types';
import { BASE_CURRENCY, CURRENCY_CODES } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface FormValues {
  from_currency: CurrencyCode;
  rate: number;
}

interface ManualRateModalProps {
  open: boolean;
  initialCurrency?: CurrencyCode;
  onClose: () => void;
}

export function ManualRateModal({ open, initialCurrency, onClose }: ManualRateModalProps) {
  const [form] = Form.useForm<FormValues>();
  const save = useSetManualRate(onClose);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ from_currency: initialCurrency ?? 'GBP' });
  }, [open, initialCurrency, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      from_currency: values.from_currency,
      to_currency: BASE_CURRENCY,
      rate: String(values.rate),
    });
  };

  return (
    <Modal
      open={open}
      title="Enter a manual exchange rate"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Save rate"
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        className="oi-form-alert"
        message="Use this when the rate service is unreachable. Transactions already saved keep the rate they were recorded with."
      />
      <Form form={form} layout="vertical">
        <Form.Item name="from_currency" label="Currency" rules={[{ required: true }]}>
          <Select
            options={CURRENCY_CODES.filter((code) => code !== BASE_CURRENCY).map((code) => ({
              value: code,
              label: `1 ${code} = ? ${BASE_CURRENCY}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="rate"
          label={`Rate to ${BASE_CURRENCY}`}
          rules={[
            { required: true, message: 'Enter a rate' },
            {
              validator: (_, value) =>
                value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
            },
          ]}
        >
          <InputNumber className="oi-full" step={0.0001} precision={6} placeholder="9.6500" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
