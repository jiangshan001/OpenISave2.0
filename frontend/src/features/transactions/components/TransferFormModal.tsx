import { Alert, Col, DatePicker, Form, Input, Modal, Row, Select, Statistic } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts, useCreateTransfer } from '@/hooks/useLedger';
import type { CurrencyCode } from '@/types';
import { toApiDate } from '@/utils/dates';
import { toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface FormValues {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  dest_amount?: number;
  fee?: number;
  transaction_date: Dayjs;
  description?: string;
  note?: string;
}

export function TransferFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const [fromId, setFromId] = useState<number | undefined>();
  const [toId, setToId] = useState<number | undefined>();
  const [amount, setAmount] = useState<number | null>(null);
  const [destAmount, setDestAmount] = useState<number | null>(null);

  const { data: accounts } = useAccounts();
  const transfer = useCreateTransfer(onClose);

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((account) => account.is_active && !account.is_archived),
    [accounts],
  );
  const source = activeAccounts.find((account) => account.id === fromId);
  const destination = activeAccounts.find((account) => account.id === toId);
  const sourceCurrency: CurrencyCode = source?.currency ?? 'CNY';
  const destCurrency: CurrencyCode = destination?.currency ?? 'CNY';
  const crossCurrency = Boolean(source && destination && sourceCurrency !== destCurrency);

  const effectiveRate =
    crossCurrency && amount && destAmount && amount > 0 ? destAmount / amount : null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFromId(undefined);
    setToId(undefined);
    setAmount(null);
    setDestAmount(null);
    form.setFieldsValue({ transaction_date: dayjs() });
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    transfer.mutate({
      from_account_id: values.from_account_id,
      to_account_id: values.to_account_id,
      amount_minor: toMinor(values.amount, sourceCurrency),
      dest_amount_minor: crossCurrency ? toMinor(values.dest_amount ?? 0, destCurrency) : null,
      fee_minor: values.fee ? toMinor(values.fee, sourceCurrency) : 0,
      transaction_date: toApiDate(values.transaction_date),
      description: values.description?.trim() || null,
      note: values.note?.trim() || null,
    });
  };

  const accountOptions = (excludeId?: number) =>
    activeAccounts
      .filter((account) => account.id !== excludeId)
      .map((account) => ({ value: account.id, label: `${account.name} · ${account.currency}` }));

  return (
    <Modal
      open={open}
      title="Transfer between accounts"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Record transfer"
      confirmLoading={transfer.isPending}
      width={620}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="A transfer moves money between your own accounts. It is not counted as income or expense and does not change your net worth."
      />
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="from_account_id" label="From" rules={[{ required: true }]}>
              <Select
                placeholder="Source account"
                onChange={(value: number) => setFromId(value)}
                options={accountOptions(toId)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="to_account_id" label="To" rules={[{ required: true }]}>
              <Select
                placeholder="Destination account"
                onChange={(value: number) => setToId(value)}
                options={accountOptions(fromId)}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={crossCurrency ? 12 : 24}>
            <Form.Item
              name="amount"
              label={`Amount sent (${sourceCurrency})`}
              rules={[
                { required: true, message: 'Enter an amount' },
                {
                  validator: (_, value) =>
                    value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
                },
              ]}
            >
              <MoneyInput currency={sourceCurrency} onChange={setAmount} />
            </Form.Item>
          </Col>
          {crossCurrency ? (
            <Col span={12}>
              <Form.Item
                name="dest_amount"
                label={`Amount received (${destCurrency})`}
                rules={[
                  { required: true, message: 'Enter the amount received' },
                  {
                    validator: (_, value) =>
                      value > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error('Must be above zero')),
                  },
                ]}
              >
                <MoneyInput currency={destCurrency} onChange={setDestAmount} />
              </Form.Item>
            </Col>
          ) : null}
        </Row>

        {crossCurrency && effectiveRate ? (
          <Statistic
            title="Effective exchange rate"
            value={`1 ${sourceCurrency} = ${effectiveRate.toFixed(4)} ${destCurrency}`}
            valueStyle={{ fontSize: 15 }}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="transaction_date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="fee"
              label={`Fee (${sourceCurrency})`}
              tooltip="Recorded as a separate expense so it appears in your spending."
            >
              <MoneyInput currency={sourceCurrency} placeholder="0.00" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Description">
          <Input placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
