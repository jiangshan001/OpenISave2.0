import { DatePicker, Form, Input, Modal } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAddValuation } from '@/hooks/useAssets';
import type { Asset } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface FormValues {
  valuation_date: Dayjs;
  value?: number;
  note?: string;
}

interface AssetValuationModalProps {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
}

export function AssetValuationModal({ open, asset, onClose }: AssetValuationModalProps) {
  const [form] = Form.useForm<FormValues>();
  const add = useAddValuation(onClose);
  const currency = asset?.purchase_currency ?? 'CNY';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ valuation_date: dayjs() });
  }, [open, form]);

  const handleSubmit = async () => {
    if (!asset) return;
    const values = await validateOrNull(form);
    if (!values) return;
    add.mutate({
      id: asset.id,
      payload: {
        value_minor: toMinor(values.value ?? 0, currency),
        valuation_date: toApiDate(values.valuation_date),
        note: values.note?.trim() || undefined,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={asset ? `Value ${asset.name}` : 'Add valuation'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Save valuation"
      confirmLoading={add.isPending}
      width={480}
      destroyOnHidden
    >
      <p className="oi-muted" style={{ marginTop: 0 }}>
        Valuations are kept as a history, so you can see how this asset has depreciated.
      </p>
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="value"
          label={`Estimated value (${currency})`}
          rules={[{ required: true, message: 'Enter a value' }]}
        >
          <MoneyInput currency={currency} autoFocus />
        </Form.Item>
        <Form.Item
          name="valuation_date"
          label="As at"
          rules={[{ required: true, message: 'Pick a date' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD MMM YYYY"
            disabledDate={(value) =>
              value && asset ? value < dayjs(asset.purchase_date).startOf('day') : false
            }
          />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
