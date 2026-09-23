import { Alert, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useSaveLiability } from '@/hooks/useAssets';
import type { CurrencyCode } from '@/types';
import type { Liability, LiabilityType } from '@/types/asset';
import { toApiDate } from '@/utils/dates';
import { CURRENCY_CODES, toMajor, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

const TYPE_OPTIONS: { value: LiabilityType; label: string }[] = [
  { value: 'financing', label: 'Financing / instalments' },
  { value: 'loan', label: 'Loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'other', label: 'Other debt' },
];

interface FormValues {
  name: string;
  liability_type: LiabilityType;
  currency: CurrencyCode;
  original_amount?: number;
  outstanding_amount?: number;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  interest_rate_percent?: number;
  lender?: string;
  note?: string;
}

interface LiabilityFormModalProps {
  open: boolean;
  liability?: Liability | null;
  onClose: () => void;
}

export function LiabilityFormModal({ open, liability, onClose }: LiabilityFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [currency, setCurrency] = useState<CurrencyCode>('CNY');
  const save = useSaveLiability(onClose);
  const isEdit = Boolean(liability);

  useEffect(() => {
    if (!open) return;
    if (liability) {
      setCurrency(liability.currency);
      form.setFieldsValue({
        name: liability.name,
        liability_type: liability.liability_type,
        currency: liability.currency,
        original_amount: toMajor(liability.original_amount_minor, liability.currency),
        start_date: liability.start_date ? dayjs(liability.start_date) : null,
        end_date: liability.end_date ? dayjs(liability.end_date) : null,
        interest_rate_percent: liability.interest_rate_percent
          ? Number(liability.interest_rate_percent)
          : undefined,
        lender: liability.lender ?? undefined,
        note: liability.note ?? undefined,
      });
    } else {
      setCurrency('CNY');
      form.resetFields();
      form.setFieldsValue({ currency: 'CNY', liability_type: 'financing' });
    }
  }, [open, liability, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: liability?.id,
      payload: {
        name: values.name.trim(),
        liability_type: values.liability_type,
        currency: values.currency,
        original_amount_minor: toMinor(values.original_amount ?? 0, values.currency),
        outstanding_amount_minor: isEdit
          ? undefined
          : toMinor(values.outstanding_amount ?? values.original_amount ?? 0, values.currency),
        start_date: values.start_date ? toApiDate(values.start_date) : null,
        end_date: values.end_date ? toApiDate(values.end_date) : null,
        interest_rate_percent:
          values.interest_rate_percent !== undefined && values.interest_rate_percent !== null
            ? String(values.interest_rate_percent)
            : null,
        lender: values.lender?.trim() || null,
        note: values.note?.trim() || null,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${liability?.name}` : 'Add liability'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Save changes' : 'Add liability'}
      confirmLoading={save.isPending}
      width={620}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          isEdit
            ? 'The outstanding balance lives on this liability’s account. Record repayments to change it.'
            : 'A liability gets its own account, which carries the outstanding balance. That keeps one source of truth for what you owe.'
        }
      />
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: 'Give the liability a name' }]}
            >
              <Input placeholder="e.g. Apple Financing" autoFocus />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="liability_type" label="Type" rules={[{ required: true }]}>
              <Select options={TYPE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select
                disabled={isEdit}
                onChange={(value: CurrencyCode) => setCurrency(value)}
                options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="original_amount"
              label="Original amount"
              rules={[{ required: true, message: 'Enter the original amount' }]}
            >
              <MoneyInput currency={currency} />
            </Form.Item>
          </Col>
          <Col span={8}>
            {!isEdit ? (
              <Form.Item
                name="outstanding_amount"
                label="Owed right now"
                tooltip="Leave empty to use the original amount."
              >
                <MoneyInput currency={currency} />
              </Form.Item>
            ) : null}
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="start_date" label="Start date">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="end_date" label="Ends">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="interest_rate_percent" label="Interest rate %">
              <InputNumber style={{ width: '100%' }} min={0} step={0.1} precision={4} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="lender" label="Lender">
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
