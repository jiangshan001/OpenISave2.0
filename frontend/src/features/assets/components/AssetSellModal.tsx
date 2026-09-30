import { Alert, Col, DatePicker, Form, Modal, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts } from '@/hooks/useLedger';
import { useSellAsset } from '@/hooks/useAssets';
import type { AssetStatus } from '@/types/asset';
import type { Asset } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { isLiabilityType } from '@/utils/labels';
import { toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface FormValues {
  sale_date: Dayjs;
  sale_price?: number;
  destination_account_id?: number;
  status: AssetStatus;
}

interface AssetSellModalProps {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
}

export function AssetSellModal({ open, asset, onClose }: AssetSellModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { data: accounts } = useAccounts();
  const sell = useSellAsset(onClose);
  const currency = asset?.purchase_currency ?? 'CNY';

  const destinations = useMemo(
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
    form.setFieldsValue({ sale_date: dayjs(), status: 'sold' });
  }, [open, form]);

  const handleSubmit = async () => {
    if (!asset) return;
    const values = await validateOrNull(form);
    if (!values) return;
    sell.mutate({
      id: asset.id,
      payload: {
        sale_date: toApiDate(values.sale_date),
        sale_price_minor: toMinor(values.sale_price ?? 0, currency),
        sale_currency: currency,
        destination_account_id: values.destination_account_id ?? null,
        status: values.status,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={asset ? `Sell ${asset.name}` : 'Sell asset'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Mark as sold"
      confirmLoading={sell.isPending}
      width={560}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        className="oi-form-alert"
        message="The asset leaves your current holdings but keeps its full history, so its lifetime cost stays available."
      />
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="sale_date"
              label="Sale date"
              rules={[{ required: true, message: 'Pick a date' }]}
            >
              <DatePicker
                className="oi-full"
                format="DD MMM YYYY"
                disabledDate={(value) =>
                  value &&
                  (value > dayjs().endOf('day') ||
                    (asset ? value < dayjs(asset.purchase_date).startOf('day') : false))
                }
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="sale_price"
              label={`Sale price (${currency})`}
              rules={[{ required: true, message: 'Enter the sale price' }]}
            >
              <MoneyInput currency={currency} autoFocus />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="status" label="Outcome" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'sold', label: 'Sold' },
              { value: 'disposed', label: 'Disposed of / written off' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="destination_account_id"
          label={`Money received into (${currency})`}
          tooltip="Leave empty if no money changed hands."
        >
          <Select
            allowClear
            placeholder="Select an account"
            options={destinations.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.currency}`,
            }))}
            notFoundContent={`No ${currency} account available`}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
