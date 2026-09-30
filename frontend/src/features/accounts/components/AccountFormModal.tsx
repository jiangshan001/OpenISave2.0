import { Alert, Col, Form, Input, Modal, Row, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';

import type { AccountPayload } from '@/api/accounts';
import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccountPurposes, useSaveAccount } from '@/hooks/useLedger';
import type { AccountBalance, AccountType, CurrencyCode } from '@/types';
import { ACCOUNT_TYPE_LABELS, isLiabilityType } from '@/utils/labels';
import { CURRENCY_CODES, CURRENCY_META, toMajor, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';

interface AccountFormValues {
  name: string;
  institution?: string;
  account_type: AccountType;
  currency: CurrencyCode;
  purpose?: string;
  opening_amount?: number | null;
  include_in_net_worth: boolean;
  note?: string;
}

interface AccountFormModalProps {
  open: boolean;
  account?: AccountBalance | null;
  onClose: () => void;
}

export function AccountFormModal({ open, account, onClose }: AccountFormModalProps) {
  const [form] = Form.useForm<AccountFormValues>();
  const { data: purposes } = useAccountPurposes();
  const save = useSaveAccount(onClose);
  const [currency, setCurrency] = useState<CurrencyCode>('CNY');
  const [accountType, setAccountType] = useState<AccountType>('bank');

  const isEdit = Boolean(account);
  const liability = isLiabilityType(accountType);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setCurrency(account.currency);
      setAccountType(account.account_type);
      form.setFieldsValue({
        name: account.name,
        institution: account.institution ?? undefined,
        account_type: account.account_type,
        currency: account.currency,
        purpose: account.purpose ?? undefined,
        opening_amount: Math.abs(toMajor(account.opening_balance_minor, account.currency)),
        include_in_net_worth: account.include_in_net_worth,
        note: account.note ?? undefined,
      });
    } else {
      setCurrency('CNY');
      setAccountType('bank');
      form.resetFields();
      form.setFieldsValue({
        account_type: 'bank',
        currency: 'CNY',
        include_in_net_worth: true,
        opening_amount: 0,
      });
    }
  }, [open, account, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    const magnitude = toMinor(values.opening_amount ?? 0, values.currency);
    const payload: AccountPayload = {
      name: values.name.trim(),
      institution: values.institution?.trim() || null,
      account_type: values.account_type,
      currency: values.currency,
      purpose: values.purpose || null,
      // Liability accounts hold a negative balance, so an entered "amount owed"
      // is stored as a negative opening balance.
      opening_balance_minor: isLiabilityType(values.account_type) ? -magnitude : magnitude,
      include_in_net_worth: values.include_in_net_worth,
      note: values.note?.trim() || null,
    };
    save.mutate({ id: account?.id, payload });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${account?.name}` : 'Add account'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Save changes' : 'Create account'}
      confirmLoading={save.isPending}
      width={620}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="name"
              label="Account name"
              rules={[{ required: true, message: 'Give the account a name' }]}
            >
              <Input placeholder="e.g. 招商银行 / Monzo" autoFocus />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="institution" label="Institution">
              <Input placeholder="e.g. China Merchants Bank" />
            </Form.Item>
          </Col>
        </Row>

        <div className="oi-form-section">Classification</div>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="account_type" label="Type" rules={[{ required: true }]}>
              <Select
                onChange={(value: AccountType) => setAccountType(value)}
                options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select
                disabled={isEdit}
                onChange={(value: CurrencyCode) => setCurrency(value)}
                options={CURRENCY_CODES.map((code) => ({
                  value: code,
                  label: `${code} — ${CURRENCY_META[code].name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="purpose" label="Purpose">
              <Select
                allowClear
                placeholder="Select a purpose"
                options={(purposes ?? []).map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <div className="oi-form-section">Balance</div>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="opening_amount"
              label={liability ? 'Amount currently owed' : 'Opening balance'}
              rules={[
                { required: true, message: 'Enter an opening balance' },
                {
                  validator: (_, value) =>
                    value === null || value === undefined || value >= 0
                      ? Promise.resolve()
                      : Promise.reject(new Error('Enter a positive amount')),
                },
              ]}
            >
              <MoneyInput currency={currency} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="include_in_net_worth"
              label="Include in net worth"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        {liability ? (
          <Alert
            type="info"
            showIcon
            className="oi-form-alert"
            message="This is a liability account. The amount owed is stored as a negative balance and subtracted from net worth."
          />
        ) : null}

        {isEdit ? (
          <Alert
            type="warning"
            showIcon
            className="oi-form-alert"
            message="Changing the opening balance shifts every historical balance for this account."
          />
        ) : null}

        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
