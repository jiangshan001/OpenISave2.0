import { Alert, Col, Form, Row, Select, Switch } from 'antd';

import { MoneyInput } from '@/components/forms/MoneyInput';
import type { AccountBalance, CurrencyCode } from '@/types';
import type { Liability } from '@/types/asset';
import { formatMoney } from '@/utils/money';

interface AssetPaymentFieldsProps {
  currency: CurrencyCode;
  trackPayment: boolean;
  onTrackPaymentChange: (value: boolean) => void;
  cashPortionMinor: number;
  financedMajor: number;
  onFinancedChange: (value: number) => void;
  payableAccounts: AccountBalance[];
  liabilities: Liability[];
}

export function AssetPaymentFields({
  currency,
  trackPayment,
  onTrackPaymentChange,
  cashPortionMinor,
  financedMajor,
  onFinancedChange,
  payableAccounts,
  liabilities,
}: AssetPaymentFieldsProps) {
  return (
    <>
      <Form.Item
        name="track_payment"
        label="Record how this was paid for"
        valuePropName="checked"
        tooltip="Leave this off for something you already owned before using OpenISave."
      >
        <Switch onChange={onTrackPaymentChange} />
      </Form.Item>

      {trackPayment ? (
        <>
          <Alert
            type="info"
            showIcon
            className="oi-form-alert"
            message="Buying an asset moves value, it does not spend it. Your net worth stays the same — cash simply becomes a possession."
          />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="paid_from_account_id"
                label={`Paid from (${currency})`}
                rules={[
                  {
                    required: cashPortionMinor > 0,
                    message: 'Choose the account the cash came from',
                  },
                ]}
              >
                <Select
                  allowClear
                  placeholder="Select an account"
                  options={payableAccounts.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.currency}`,
                  }))}
                  notFoundContent={`No ${currency} account available`}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="financed"
                label="Of which financed"
                tooltip="Leave empty when you paid the whole amount in cash."
              >
                <MoneyInput currency={currency} onChange={(value) => onFinancedChange(value ?? 0)} />
              </Form.Item>
            </Col>
          </Row>
          {financedMajor > 0 ? (
            <Form.Item
              name="financed_liability_account_id"
              label="Financed through"
              rules={[{ required: true, message: 'Choose the liability carrying the debt' }]}
              extra={`Cash portion: ${formatMoney(cashPortionMinor, currency)}`}
            >
              <Select
                placeholder="Select a liability"
                options={liabilities.map((item) => ({
                  value: item.account_id,
                  label: `${item.name} · ${item.currency}`,
                }))}
                notFoundContent={`Create a ${currency} liability first, on the Assets page`}
              />
            </Form.Item>
          ) : null}
        </>
      ) : null}
    </>
  );
}
