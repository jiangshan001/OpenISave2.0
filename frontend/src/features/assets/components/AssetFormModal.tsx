import { Col, DatePicker, Form, Input, Modal, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import type { AssetPayload } from '@/api/assets';
import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts } from '@/hooks/useLedger';
import { useAssetCategories, useLiabilities, useSaveAsset } from '@/hooks/useAssets';
import type { CurrencyCode } from '@/types';
import type { Asset } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { isLiabilityType } from '@/utils/labels';
import { CURRENCY_CODES, toMajor, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';
import { AssetNetWorthField } from './AssetNetWorthField';
import { AssetPaymentFields } from './AssetPaymentFields';

interface FormValues {
  name: string;
  asset_category_id?: number;
  purchase_date: Dayjs;
  purchase_price?: number;
  purchase_currency: CurrencyCode;
  include_in_net_worth: boolean;
  track_payment: boolean;
  paid_from_account_id?: number;
  financed?: number;
  financed_liability_account_id?: number;
  description?: string;
  note?: string;
}

interface AssetFormModalProps {
  open: boolean;
  asset?: Asset | null;
  onClose: () => void;
}

export function AssetFormModal({ open, asset, onClose }: AssetFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [currency, setCurrency] = useState<CurrencyCode>('CNY');
  const [trackPayment, setTrackPayment] = useState(false);
  const [financed, setFinanced] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [netWorthManual, setNetWorthManual] = useState(false);

  const { data: accounts } = useAccounts();
  const { data: categories } = useAssetCategories();
  const { data: liabilities } = useLiabilities();
  const save = useSaveAsset(onClose);
  const isEdit = Boolean(asset);

  const payableAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (item) =>
          !item.is_archived && item.is_active && !isLiabilityType(item.account_type) &&
          item.currency === currency,
      ),
    [accounts, currency],
  );
  const liabilityAccounts = useMemo(
    () => (liabilities ?? []).filter((item) => item.currency === currency),
    [liabilities, currency],
  );

  const category = (categories ?? []).find((item) => item.id === categoryId) ?? null;
  const categoryDefault = category?.include_in_net_worth_default ?? false;

  // Until the user chooses, the toggle mirrors the category default.
  useEffect(() => {
    if (open && !netWorthManual) form.setFieldValue('include_in_net_worth', categoryDefault);
  }, [open, netWorthManual, categoryDefault, form]);

  useEffect(() => {
    if (!open) return;
    if (asset) {
      setCurrency(asset.purchase_currency);
      setTrackPayment(false);
      setCategoryId(asset.asset_category_id);
      setNetWorthManual(asset.include_in_net_worth_source === 'manual');
      form.setFieldsValue({
        name: asset.name,
        asset_category_id: asset.asset_category_id ?? undefined,
        purchase_date: dayjs(asset.purchase_date),
        purchase_price: toMajor(asset.purchase_price_minor, asset.purchase_currency),
        purchase_currency: asset.purchase_currency,
        include_in_net_worth: asset.include_in_net_worth,
        track_payment: false,
        description: asset.description ?? undefined,
        note: asset.note ?? undefined,
      });
    } else {
      setCurrency('CNY');
      setTrackPayment(false);
      setFinanced(0);
      setPrice(0);
      setCategoryId(null);
      setNetWorthManual(false);
      form.resetFields();
      form.setFieldsValue({
        purchase_currency: 'CNY',
        purchase_date: dayjs(),
        include_in_net_worth: false,
        track_payment: false,
      });
    }
  }, [open, asset, form]);

  const cashPortion = Math.max((price || 0) - (financed || 0), 0);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    const priceMinor = toMinor(values.purchase_price ?? 0, values.purchase_currency);
    const financedMinor = values.financed
      ? toMinor(values.financed, values.purchase_currency)
      : 0;

    const payload: AssetPayload = {
      name: values.name.trim(),
      asset_category_id: values.asset_category_id ?? null,
      description: values.description?.trim() || null,
      purchase_date: toApiDate(values.purchase_date),
      purchase_price_minor: priceMinor,
      purchase_currency: values.purchase_currency,
      // null = follow the category default (decided by the backend).
      include_in_net_worth: netWorthManual ? values.include_in_net_worth : null,
      note: values.note?.trim() || null,
    };

    if (!isEdit && values.track_payment) {
      payload.payment = {
        account_id: values.paid_from_account_id ?? null,
        cash_amount_minor: priceMinor - financedMinor,
        liability_account_id: values.financed_liability_account_id ?? null,
        financed_amount_minor: financedMinor,
      };
      const liability = (liabilities ?? []).find(
        (item) => item.account_id === values.financed_liability_account_id,
      );
      if (liability) payload.linked_liability_id = liability.id;
    }

    save.mutate({ id: asset?.id, payload });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${asset?.name}` : 'Add asset'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Save changes' : 'Add asset'}
      confirmLoading={save.isPending}
      width={660}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: 'Give the asset a name' }]}
            >
              <Input placeholder="e.g. MacBook Pro" autoFocus />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="asset_category_id" label="Category">
              <Select
                allowClear
                placeholder="Select a category"
                onChange={(value?: number) => setCategoryId(value ?? null)}
                options={(categories ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="purchase_date" label="Purchase date" rules={[{ required: true }]}>
              <DatePicker
                className="oi-full"
                format="DD MMM YYYY"
                disabledDate={(value) => value && value > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="purchase_currency" label="Currency" rules={[{ required: true }]}>
              <Select
                disabled={isEdit}
                onChange={(value: CurrencyCode) => setCurrency(value)}
                options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="purchase_price"
              label="Purchase price"
              rules={[
                { required: true, message: 'Enter the price' },
                {
                  validator: (_, value) =>
                    value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
                },
              ]}
            >
              <MoneyInput currency={currency} disabled={isEdit} onChange={(v) => setPrice(v ?? 0)} />
            </Form.Item>
          </Col>
        </Row>

        <AssetNetWorthField
          categoryDefault={categoryDefault}
          categoryName={category?.name ?? null}
          manual={netWorthManual}
          onManualChange={setNetWorthManual}
          onReset={() => setNetWorthManual(false)}
        />

        {!isEdit ? (
          <AssetPaymentFields
            currency={currency}
            trackPayment={trackPayment}
            onTrackPaymentChange={setTrackPayment}
            cashPortionMinor={toMinor(cashPortion, currency)}
            financedMajor={financed}
            onFinancedChange={setFinanced}
            payableAccounts={payableAccounts}
            liabilities={liabilityAccounts}
          />
        ) : null}

        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
